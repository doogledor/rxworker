import { Observable, Subject } from 'rxjs'
import { v4 } from 'uuid'
import { scan, throttleTime } from 'rxjs/operators'
import { IQuery, IQueryRegister, UUId, AllOutputs } from './types'
import { TopicConfig, TopicIds, topicMap } from './data/topics'
import { from } from 'ix/iterable'
import { map } from 'ix/iterable/operators/map'
import { filter } from 'ix/iterable/operators/filter'
import { Flux } from './flux'
import { flushSync } from 'react-dom'

export const setupRegistry = () => {
    let flux: Flux
    const topicToUUId: Map<TopicIds, Set<UUId>> = new Map()
    const UUIdToTopic: Map<UUId, Set<TopicIds>> = new Map()
    const registeredQueries: Map<UUId, IQueryRegister> = new Map()
    const registeredSubjects: Map<UUId, Subject<AllOutputs>> = new Map()
    const registeredOutputs: Map<UUId, Observable<AllOutputs>> = new Map()

    function makeSubscription(uuid: UUId) {
        return (cb: any) => {
            const sub = registeredOutputs.get(uuid)!.subscribe(cb)
            return () => {
                sub.unsubscribe()
                registeredSubjects.get(uuid)?.complete()
                registeredQueries.delete(uuid)
                registeredSubjects.delete(uuid)
                registeredOutputs.delete(uuid)
                const topics = UUIdToTopic.get(uuid)

                topics?.forEach((tId) => {
                    const removeUUId = topicToUUId.get(tId) || new Set()
                    removeUUId.delete(uuid)
                    topicToUUId.set(tId, new Set([...removeUUId]))
                })
                flux.updateQueries()
            }
        }
    }
    return {
        set flux(f: Flux) {
            flux = f
        },
        get registeredQueries() {
            return registeredQueries
        },
        get registeredSubjects() {
            return registeredSubjects
        },
        getRegisteredQueriesByTopic(tId: TopicIds) {
            if (topicToUUId.has(tId)) {
                return from(topicToUUId.get(tId)!).pipe(
                    map((uuid) => registeredQueries.get(uuid)!),
                    filter((v) => !!v)
                )
            }
            return from(new Set<IQueryRegister>())
        },
        registerQuery(q: IQuery) {
            const uuid = v4()
            const data: TopicConfig = topicMap[q.topicId]
            const assetIds = new Set(q.assetId2)
            const topicIds = new Set([q.topicId])
            const traitIds = new Set([q.traitId])
            topicToUUId.set(
                q.topicId,
                new Set([
                    ...(topicToUUId.get(q.topicId) || new Set([uuid])),
                    ...new Set([uuid]),
                ])
            )
            UUIdToTopic.set(uuid, topicIds)
            registeredQueries.set(uuid, { uuid, assetIds, topicIds, traitIds })
            // TODO magic infer output from topicId
            const sub = new Subject<AllOutputs>()
            const output$ = sub.pipe(
                scan((acc, curr) => new Map([...acc, ...curr]), new Map()),
                throttleTime(data.debounce)
            )
            registeredOutputs.set(uuid, output$)
            registeredSubjects.set(uuid, sub)
            return makeSubscription(uuid)
        },
    }
}
export type Registry = ReturnType<typeof setupRegistry>
