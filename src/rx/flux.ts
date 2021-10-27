import { Subject, Subscription, tap } from 'rxjs'
import { AssetId2, IAssetTopicLocator, IPublicTopicQuery } from './types'
import { Registry } from './registry'
import { isEqual, isNil, zip } from 'lodash-es'
import { subscribeStream } from './flux/sim'
import { TopicData } from './data/topics'

export const setupFlux = ({
    command,
    registry,
}: {
    command: Subject<any>
    registry: Registry
}) => {
    let queries: IPublicTopicQuery[] = []
    let sub: Subscription

    function onFluxMessage(params: TopicData) {
        registry
            .getRegisteredQueriesByTopic(params.payload.topicId)
            .forEach((q) => {
                if (registry.registeredSubjects.has(q.uuid)) {
                    //  TODO FIXME -- assetIs will not be on the message
                    // here we should check the assetId to match the query
                    registry.registeredSubjects
                        .get(q.uuid)!
                        .next(
                            new Map([
                                [
                                    params.assetId2,
                                    { uuid: q.uuid, payload: params.payload },
                                ],
                            ])
                        )
                }
            })
    }

    function updateQueries() {
        const groupedByAssetID: Map<
            AssetId2,
            {
                _hash: Set<string>
                topicLocators: IAssetTopicLocator[]
                topicIds: Set<number>
                traitIds: Set<number>
            }
        > = new Map()
        const newQueries: IPublicTopicQuery[] = []
        // the block translates
        registry.registeredQueries.forEach((value, hookID) => {
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
                        if (
                            !d2._hash.has(hash) &&
                            !isNil(traitId) &&
                            !isNil(topicId)
                        ) {
                            d2._hash.add(hash)
                            d2.topicLocators.push({ topicId, traitId })
                        }
                    })
                    groupedByAssetID.set(assetId, d2)
                }
            })
        })

        groupedByAssetID.forEach((value, assetId) => {
            newQueries.push({
                topicLocators: value.topicLocators,
                specific: {
                    assetIds: [assetId],
                },
            })
        })
        const queriesEqual = isEqual(queries, newQueries)
        queries = newQueries
        if (!queriesEqual && sub) {
            sub.unsubscribe()
        }
        if (queries.length) {
            sub = subscribeStream(queries, onFluxMessage)
        }
    }

    const csub = command
        .pipe(
            tap((c) => {
                if (c.name === 'updateQueries') {
                    updateQueries()
                }
                if (c.name === 'terminate') {
                    updateQueries()
                    csub.unsubscribe()
                    if (sub) sub.unsubscribe()
                }
            })
        )
        .subscribe()

    return {}
}
export type Flux = ReturnType<typeof setupFlux>
