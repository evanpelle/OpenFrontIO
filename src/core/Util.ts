import {v4 as uuidv4} from 'uuid';


import {Cell, Game, Player, TerraNullius, Tile} from "./game/Game";

export function manhattanDist(c1: Cell, c2: Cell): number {
    return Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y);
}

export function euclideanDist(c1: Cell, c2: Cell): number {
    return Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
}

export function manhattanDistWrapped(c1: Cell, c2: Cell, width: number): number {
    // Calculate x distance
    let dx = Math.abs(c1.x - c2.x);
    // Check if wrapping around the x-axis is shorter
    dx = Math.min(dx, width - dx);

    // Calculate y distance (no wrapping for y-axis)
    let dy = Math.abs(c1.y - c2.y);

    // Return the sum of x and y distances
    return dx + dy;
}

export function within(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function dist(root: Tile, dist: number): (tile: Tile) => boolean {
    return (n: Tile) => manhattanDist(root.cell(), n.cell()) <= dist;
}

export function and(x: (tile: Tile) => boolean, y: (tile: Tile) => boolean): (tile: Tile) => boolean {
    return (tile: Tile) => x(tile) && y(tile)
}

// TODO: refactor to new file
export function sourceDstOceanShore(game: Game, src: Player, dst: Player | TerraNullius, cell: Cell): [Tile | null, Tile | null] {
    let srcTile = closestOceanShoreFromPlayer(src, cell, game.width())
    let dstTile: Tile | null = null
    if (dst.isPlayer()) {
        dstTile = closestOceanShoreFromPlayer(dst as Player, cell, game.width())
    } else {
        dstTile = closestOceanShoreTN(game.tile(cell), 300)
    }
    return [srcTile, dstTile]
}

function closestOceanShoreFromPlayer(player: Player, target: Cell, width: number): Tile | null {
    const shoreTiles = Array.from(player.borderTiles()).filter(t => t.isOceanShore())
    if (shoreTiles.length == 0) {
        return null
    }

    return shoreTiles.reduce((closest, current) => {
        const closestDistance = manhattanDistWrapped(target, closest.cell(), width);
        const currentDistance = manhattanDistWrapped(target, current.cell(), width);
        return currentDistance < closestDistance ? current : closest;
    });
}

function closestOceanShoreTN(tile: Tile, searchDist: number): Tile {
    const tn = Array.from(bfs(tile, and(t => !t.hasOwner(), dist(tile, searchDist))))
        .filter(t => t.isOceanShore())
        .sort((a, b) => manhattanDist(tile.cell(), a.cell()) - manhattanDist(tile.cell(), b.cell()))
    if (tn.length == 0) {
        return null
    }
    return tn[0]
}

export function bfs(tile: Tile, filter: (tile: Tile) => boolean): Set<Tile> {
    const seen = new Set<Tile>
    const q: Tile[] = []
    q.push(tile)
    while (q.length > 0) {
        const curr = q.pop()
        seen.add(curr)
        for (const n of curr.neighbors()) {
            if (!seen.has(n) && filter(n)) {
                q.push(n)
            }
        }
    }
    return seen
}

export function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

export function calculateBoundingBox(borderTiles: ReadonlySet<Tile>): {min: Cell; max: Cell} {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    borderTiles.forEach((tile: Tile) => {
        const cell = tile.cell();
        minX = Math.min(minX, cell.x);
        minY = Math.min(minY, cell.y);
        maxX = Math.max(maxX, cell.x);
        maxY = Math.max(maxY, cell.y);
    });

    return {min: new Cell(minX, minY), max: new Cell(maxX, maxY)}
}

export function inscribed(outer: {min: Cell; max: Cell}, inner: {min: Cell; max: Cell}): boolean {
    return (
        outer.min.x <= inner.min.x &&
        outer.min.y <= inner.min.y &&
        outer.max.x >= inner.max.x &&
        outer.max.y >= inner.max.y
    );
}

export function getMode(list: string[]): string {
    // Count occurrences
    const counts: {[key: string]: number} = {};
    for (const item of list) {
        counts[item] = (counts[item] || 0) + 1;
    }

    // Find the item with the highest count
    let mode = '';
    let maxCount = 0;

    for (const item in counts) {
        if (counts[item] > maxCount) {
            maxCount = counts[item];
            mode = item;
        }
    }

    return mode;
}