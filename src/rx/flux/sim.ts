import { interval, merge, Observer } from 'rxjs'
import { map, mergeMap } from 'rxjs/operators'
import { TopicData, TopicIds, topicMap } from '../data/topics'
import { AssetId2, IPublicTopicQuery } from '../types'

const makeTopic$ = (key: string, assetIds: AssetId2[]) => {
    const [topicId, traitId] = key.split('_')
    const l = topicMap[Number(topicId) as TopicIds]
    return interval(l.interval).pipe(
        map(() =>
            assetIds.map((a) => {
                const data = {
                    assetId2: a,
                    payload: {
                        ...l.data.payload,
                        timestamp: Date.now(),
                        assetId2: `${a}`,
                        topicId: Number(topicId),
                        traitId: Number(traitId),
                    },
                }
                return data
            })
        ),
        mergeMap((arr) => arr)
    )
}

const makeFluxStream$ = (q: IPublicTopicQuery[]) => {
    // brak into assets
    const sep = q.reduce((acc, qr) => {
        qr.topicLocators.forEach((tl) => {
            const k = `${tl.topicId}_${tl.traitId}`
            if (!acc.has(k)) {
                acc.set(k, [])
            }
            const arr = acc.get(k)!
            arr.push(...qr.specific.assetIds)
        })
        return acc
    }, new Map<string, AssetId2[]>())

    return merge(...[...sep].map((o) => makeTopic$(o[0], o[1])))
}

export const subscribeStream = (
    q: IPublicTopicQuery[],
    cb: (value: TopicData) => void
) => {
    const f$ = makeFluxStream$(q)
    return f$.subscribe(cb)
}
