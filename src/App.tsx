import { useEffect, useRef, useState } from 'react'
import logo from './logo.svg'
import './App.css'
import { setupRxFlux } from './rx'
import { TopicIds } from './rx/data/topics'

function Sub() {
    const [assetPose, setAssetPose] = useState('')
    const [trackState, setTrackState] = useState('')
    const rxFlux = useRef(setupRxFlux())
    useEffect(() => {
        const s1 = rxFlux.current.subscribe(
            {
                assetId2: ['abc', '123'],
                topicId: TopicIds.ASSET_POSE,
                traitId: 1,
            },
            (data) => {
                console.log([...data.values()])
                setAssetPose(JSON.stringify([...data.values()]))
            }
        )
        const s2 = rxFlux.current.subscribe(
            {
                assetId2: ['XYZ', '987'],
                topicId: TopicIds.TRACK_STATE,
                traitId: 1,
            },
            (data) => {
                console.log([...data.values()])
                setTrackState(JSON.stringify([...data.values()]))
            }
        )
        return () => {
            s1()
            s2()
        }
    }, [])

    return (
        <>
            <p>{assetPose}</p>
            <p>{trackState}</p>
        </>
    )
}

function App() {
    const [sub1, setSub1] = useState(false)
    return (
        <div className="App">
            <header className="App-header">
                <img src={logo} className="App-logo" alt="logo" />
                <p>Hello Vite + React!</p>
                <button onClick={() => setSub1((s) => !s)}>toggle</button>
                {sub1 && <Sub />}
                <p>
                    Edit <code>App.tsx</code> and save to test HMR updates.
                </p>
                <p>
                    <a
                        className="App-link"
                        href="https://reactjs.org"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Learn React
                    </a>
                    {' | '}
                    <a
                        className="App-link"
                        href="https://vitejs.dev/guide/features.html"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Vite Docs
                    </a>
                </p>
            </header>
        </div>
    )
}

export default App
