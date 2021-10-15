import { TopicData, TopicIds } from './data/topics'

export type IQuery = {
    assetId2: string[]
    topicId: TopicIds
    traitId: number
}
export type AssetId2 = string
export type UUId = string
export type AllOutputs = Map<AssetId2, TopicData['payload']>
type Topic = NonNullable<IQuery>

export interface IQueryRegister {
    uuid: UUId
    assetIds: Set<AssetId2>
    topicIds: Set<number>
    traitIds: Set<number>
}

export type WorkerInput = {
    id?: UUId
    subscribe?: Topic[]
    unsubscribe?: UUId
}

export interface InternalSubjectInput {
    metadata: {
        id: string
        topicId: number
    }
    data: Map<number, unknown>
}
export interface WorkerOutput<K extends string | number | symbol, T> {
    metadata: InternalSubjectInput['metadata']
    data: Record<K, T>
}

// flux

export interface IAssetTopicLocator {
    topicId: number
    traitId: number
}

export interface IPublicTopicQuery {
    topicLocators: IAssetTopicLocator[]
    specific: {
        assetIds: AssetId2[]
    }
}
