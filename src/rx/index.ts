import { setupFlux } from './flux'
import { setupRegistry } from './registry'
import { IQuery } from './types'

export const setupRxFlux = () => {
    const registry = setupRegistry()
    const flux = setupFlux({ registry })
    registry.flux = flux

    return {
        subscribe(query: IQuery, callback: any) {
            // TODO magic cb infer
            const sub = registry.registerQuery(query)
            flux.updateQueries()
            return sub(callback)
        },
    }
}
