import { ValuesType } from 'utility-types'
export enum TopicIds {
    TRACK_STATE = 260,
    ASSET_POSE = 261,
}
export const topicMap = {
    [TopicIds.TRACK_STATE]: {
        interval: 70,
        debounce: 800,
        data: {
            assetId2: '',
            payload: {
                trackId2: '',
                topicId: 0,
                timestamp: 0,
                traitId: 0,
                lla: { lon: 0, lat: 0, alt: 0 },
            },
        },
    },
    [TopicIds.ASSET_POSE]: {
        interval: 100,
        debounce: 1000,
        data: {
            assetId2: '',
            payload: {
                assetId2: '',
                timestamp: 0,
                topicId: 0,
                traitId: 0,
                lla: { lon: 0, lat: 0, alt: 0 },
            },
        },
    },
}

export type TopicConfig = ValuesType<typeof topicMap>
export type TopicData = TopicConfig['data']
