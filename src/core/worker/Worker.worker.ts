// pathfinding.ts
import { Cell, GameMap, TerrainMap, TerrainTile, TerrainType } from "../game/Game";
import { createMiniMap, loadTerrainMap } from "../game/TerrainMapLoader";
import { PriorityQueue } from "@datastructures-js/priority-queue";
import { SerialAStar } from "../pathfinding/SerialAStar";
import { AStar, PathFindResultType, SearchNode } from "../pathfinding/AStar";
import { MiniAStar } from "../pathfinding/MiniAStar";

let terrainMapPromise: Promise<{
    terrainMap: TerrainMap,
    miniMap: TerrainMap
}> | null = null;
let searches = new PriorityQueue<Search>((a: Search, b: Search) => (a.deadline - b.deadline))
let processingInterval: number | null = null;
let isProcessingSearch = false

interface Search {
    aStar: AStar,
    deadline: number
    requestId: string,
    end: Cell
}

interface SearchRequest {
    requestId: string
    currentTick: number
    // duration in ticks
    duration: number
    start: Cell
    end: Cell
}

self.onmessage = (e) => {
    switch (e.data.type) {
        case 'init':
            initializeMap(e.data);
            break;
        case 'findPath':
            terrainMapPromise.then(tm => findPath(tm.terrainMap, tm.miniMap, e.data))
            break;
    }
};

function initializeMap(data: { gameMap: GameMap }) {
    terrainMapPromise = loadTerrainMap(data.gameMap)
        .then(async terrainMap => {
            const miniMap = await createMiniMap(terrainMap);
            return {
                terrainMap: terrainMap,
                miniMap: miniMap
            };
        });
    self.postMessage({ type: 'initialized' });
    processingInterval = setInterval(computeSearches, .1) as unknown as number;
}

function findPath(terrainMap: TerrainMap, miniTerrainMap: TerrainMap, req: SearchRequest) {
    const aStar = new MiniAStar(
        terrainMap,
        miniTerrainMap,
        terrainMap.terrain(req.start),
        terrainMap.terrain(req.end),
        (sn: SearchNode) => (sn as TerrainTile).terrainType() == TerrainType.Ocean,
        10_000,
        req.duration,
    );

    searches.enqueue({
        aStar: aStar,
        deadline: req.currentTick + req.duration,
        requestId: req.requestId,
        end: req.end
    })
}

function computeSearches() {
    if (isProcessingSearch || searches.isEmpty()) {
        return
    }

    isProcessingSearch = true

    try {
        for (let i = 0; i < 10; i++) {
            if (searches.isEmpty()) {
                return
            }
            const search = searches.dequeue()
            switch (search.aStar.compute()) {
                case PathFindResultType.Completed:
                    self.postMessage({
                        type: 'pathFound',
                        requestId: search.requestId,
                        path: search.aStar.reconstructPath()
                    });
                    break;

                case PathFindResultType.Pending:
                    searches.push(search)
                    break
                case PathFindResultType.PathNotFound:
                    console.warn(`worker: path not found to port`);
                    self.postMessage({
                        type: 'pathNotFound',
                        requestId: search.requestId,
                    });
                    break
            }
        }
    } finally {
        isProcessingSearch = false
    }
}
