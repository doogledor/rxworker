import {
    anduril,
    proto,
} from '@anduril-industries/andurilapis-pbjs/andurilapis'
import { isEqual, isNil, zip } from 'lodash'
import { iif, Observable, of, pipe, Subject, Subscription } from 'rxjs'
import { mergeMap, tap, throttleTime } from 'rxjs/operators'

import { AssetID } from '../common/types'
import {
    IAssetTopicLocator,
    IFluxPublic,
    IFollowerState,
    IMessage,
    IPublicTopicQuery,
    ITopic,
} from '../services/api/interfaces'
import { MetadataOnly, protoDecoder } from './api/proto-codecs'
import { FetchTransport } from './rpc/fetch'
import {
    Commands,
    UUId,
    InternalSubjectInput,
    WorkerInput,
    WorkerOutput,
} from './types'

const createRegisteredPipe$ = (config: WorkerInput) =>
    pipe<Observable<InternalSubjectInput>, Observable<InternalSubjectInput>>(
        mergeMap((input) =>
            iif(
                () => !!config.throttleMs,
                of(input).pipe(throttleTime(config.throttleMs!)),
                of(input)
            )
        )
    )

interface RegisterInput {
    command?: Commands
    assetIds: Set<number>
    topicIds: Set<number>
    traitIds: Set<number>
}

export class MasterWorkerContext {
    toMainThreadSubject$: Subject<any>
    queryCtx!: WorkerQueryContext
    events$: Subject<WorkerOutput<AssetID, any>>
    registeredInputs: Map<UUId, RegisterInput> = new Map()
    registeredState: Map<UUId, Map<AssetID, unknown>> = new Map()
    registeredSubjects: Map<
        UUId,
        {
            input: Subject<InternalSubjectInput>
            output: Observable<any>
            sub: Subscription
        }
    > = new Map()

    private queries!: IPublicTopicQuery[]

    constructor() {
        this.toMainThreadSubject$ = new Subject<any>()
        this.events$ = new Subject<any>()
        this.onSubscribeResult = this.onSubscribeResult.bind(this)
        this.sendToEvents = this.sendToEvents.bind(this)
    }

    /** register the hook (ie the input)  */
    registerInput(workerinput: WorkerInput) {
        if (workerinput.id && workerinput.subscribe) {
            const registered = {
                assetIds: new Set(
                    workerinput.subscribe.map((topic) => topic.assetId!)
                ),
                topicIds: new Set(
                    workerinput.subscribe.map((topic) => topic.topicId!)
                ),
                traitIds: new Set(
                    workerinput.subscribe.map((topic) => topic.traitId!)
                ),
            }
            this.registeredInputs.set(workerinput.id, registered)
            if (!this.registeredSubjects.has(workerinput.id)) {
                const input = new Subject<InternalSubjectInput>()
                const output = input.pipe(
                    createRegisteredPipe$(workerinput),
                    tap(this.sendToEvents)
                )
                this.registeredSubjects.set(workerinput.id, {
                    input,
                    output,
                    sub: output.subscribe(),
                })
            }
            if (!this.registeredState.has(workerinput.id)) {
                this.registeredState.set(workerinput.id, new Map())
            }
            const shouldUpdate = this.updateQueries()
            if (shouldUpdate) {
                this.subscribe()
            }
        }
    }

    /** unregister the hook (ie the input)  */
    unregisterInput(id: string) {
        this.registeredInputs.delete(id)
        if (this.registeredSubjects.has(id)) {
            const { input, sub } = this.registeredSubjects.get(id)!
            input.complete()
            sub.unsubscribe()
            this.registeredSubjects.delete(id)
        }
        if (this.registeredState.has(id)) {
            this.registeredState.delete(id)
        }
    }

    subscribe() {
        if (this.fluxService) {
            this.fluxService.end()
        }
        this.abortController?.abort()
        this.abortController = new AbortController()
        this.fluxService = new anduril.flux.v1.FluxPublic(
            this.transport.startRpc(
                'anduril.flux.v1.FluxPublic/SubscribeStream',
                this.abortController
            )
        )
        this.fluxService.subscribeStream(
            {
                queries: this.queries,
            },
            this.onSubscribeResult
        )
    }

    private onSubscribeResult(
        err: Error | null,
        response: anduril.flux.v1.StreamMessage | undefined
    ) {
        if (err) {
            console.error('Error encountered', err)
            return
        }
        if (!response) {
            return
        }
        const registeredSubjects = this.registeredSubjects
        if (response.messages && response.messages.messages) {
            response.messages.messages.forEach((message) => {
                const assetId = message?.publicMetadata?.topic?.assetId
                // const assetId2 = message?.publicMetadata?.topic?.assetId2;
                const topicId = message?.publicMetadata?.topic?.topicId
                if (isNil(topicId) || isNil(assetId) || !message.data) {
                    return
                }
                const payload = extractPayload(
                    message?.publicMetadata?.topic!,
                    message.data
                )
                this.registeredInputs.forEach((input, id) => {
                    if (
                        input.assetIds.has(assetId) &&
                        input.topicIds.has(topicId)
                    ) {
                        let event = payload
                        if (input.command) {
                            switch (input.command) {
                                case Commands.PROCESS_FOLLOWER_STATE:
                                    event = eventToNewFollowerState(
                                        message,
                                        payload
                                    )
                                    break
                                case Commands.PROCESS_TOWER_TOPIC_CROPPED_IMAGE: {
                                    event = eventToTowerTopicCroppedImage(
                                        message,
                                        payload
                                    )
                                    break
                                }
                                default:
                                    break
                            }
                        }
                        const { input: subject } = registeredSubjects.get(id)!
                        const stateMap = this.updateState(id, assetId, event)
                        subject.next({
                            metadata: { id, topicId },
                            data: stateMap,
                        })
                    }
                })
            })
        }
    }

    /** return true if it should resubscribe beacuse the queries have changed  */
    private updateQueries() {
        let queries: IPublicTopicQuery[] = []
        const groupedByAssetID: Map<
            number,
            {
                _hash: Set<string>
                topicLocators: IAssetTopicLocator[]
                topicIds: Set<number>
                traitIds: Set<string>
            }
        > = new Map()
        // each inout
        this.registeredInputs.forEach((value, hookID) => {
            // each assetId in that input
            value.assetIds.forEach((assetId) => {
                // const obj: IAssetTopicLocator = {};
                const d2 = groupedByAssetID.get(assetId) || {
                    _hash: new Set(),
                    topicLocators: [],
                    topicIds: new Set(),
                    traitIds: new Set(),
                }
                const valid = value.topicIds.size === value.traitIds.size
                if (!valid) {
                    console.error(
                        `${hookID} is malformed: traits and topics are not the same length`
                    )
                }
                if (valid) {
                    const topics = [...value.topicIds.values()]
                    const traits = [...value.traitIds.values()]
                    zip(topics, traits).forEach(([topicId, traitId]) => {
                        const hash = `${topicId}${traitId}`
                        if (!d2._hash.has(hash)) {
                            d2._hash.add(hash)
                            d2.topicLocators.push({ topicId, traitId })
                        }
                    })
                    groupedByAssetID.set(assetId, d2)
                }
            })
        })

        groupedByAssetID.forEach((value, assetId) => {
            queries.push({
                topicLocators: value.topicLocators,
                specific: {
                    assetIds: [assetId],
                },
            })
        })
        const queriesEqual = isEqual(this.queries, queries)
        this.queries = queries
        return !queriesEqual
    }

    private updateState(hookID: string, assetId: number, event: unknown) {
        const stateMap = this.registeredState.get(hookID)!
        stateMap.set(assetId, event)
        return stateMap
    }

    private sendToEvents(event: InternalSubjectInput) {
        this.events$.next({
            metadata: event.metadata,
            data: Object.fromEntries(event.data),
        })
    }
}

export class WorkerQueryContext {
    ctrl!: WorkerInput
    constructor(ctrl: WorkerInput) {
        this.ctrl = ctrl
    }
}

export interface WorkerContexts {
    ctx: MasterWorkerContext
    queryCtx: WorkerQueryContext
}
