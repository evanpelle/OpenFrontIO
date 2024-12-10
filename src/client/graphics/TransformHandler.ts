import { colord } from "colord";
import { EventBus } from "../../core/EventBus"
import { Cell, Game, Player } from "../../core/game/Game";
import { calculateBoundingBox, calculateBoundingBoxCenter, manhattanDist } from "../../core/Util";
import { ZoomEvent, DragEvent } from "../InputHandler";
import { GoToPlayerEvent } from "./layers/Leaderboard";
import { placeName } from "./NameBoxCalculator";

export class TransformHandler {
    public scale: number = 1.8
    private offsetX: number = -350
    private offsetY: number = -200

    private target: Cell
    private intervalID = null

    constructor(private game: Game, private eventBus: EventBus, private canvas: HTMLCanvasElement) {
        this.eventBus.on(ZoomEvent, (e) => this.onZoom(e))
        this.eventBus.on(DragEvent, (e) => this.onMove(e))
        this.eventBus.on(GoToPlayerEvent, (e) => this.onGoToPlayer(e))
    }

    boundingRect(): DOMRect {
        return this.canvas.getBoundingClientRect()
    }

    width(): number {
        return this.boundingRect().width
    }

    handleTransform(context: CanvasRenderingContext2D) {
        // Disable image smoothing for pixelated effect
        context.imageSmoothingEnabled = false;


        // Apply zoom and pan
        context.setTransform(
            this.scale,
            0,
            0,
            this.scale,
            this.game.width() / 2 - this.offsetX * this.scale,
            this.game.height() / 2 - this.offsetY * this.scale
        );
    }

    screenToWorldCoordinates(screenX: number, screenY: number): Cell {
        const canvasRect = this.boundingRect();
        const canvasX = screenX - canvasRect.left;
        const canvasY = screenY - canvasRect.top;

        // Calculate the world point we want to zoom towards
        const centerX = (canvasX - this.game.width() / 2) / this.scale + this.offsetX;
        const centerY = (canvasY - this.game.height() / 2) / this.scale + this.offsetY;

        const gameX = centerX + this.game.width() / 2
        const gameY = centerY + this.game.height() / 2

        return new Cell(Math.floor(gameX), Math.floor(gameY));
    }

    screenBoundingRect(): [Cell, Cell] {

        const LeftX = (- this.game.width() / 2) / this.scale + this.offsetX;
        const TopY = (- this.game.height() / 2) / this.scale + this.offsetY;

        const gameLeftX = LeftX + this.game.width() / 2
        const gameTopY = TopY + this.game.height() / 2


        const rightX = (screen.width - this.game.width() / 2) / this.scale + this.offsetX;
        const rightY = (screen.height - this.game.height() / 2) / this.scale + this.offsetY;

        const gameRightX = rightX + this.game.width() / 2
        const gameBottomY = rightY + this.game.height() / 2

        return [new Cell(Math.floor(gameLeftX), Math.floor(gameTopY)), new Cell(Math.floor(gameRightX), Math.floor(gameBottomY))]
    }

    screenCenter(): { screenX: number, screenY: number } {
        const [upperLeft, bottomRight] = this.screenBoundingRect()
        return {
            screenX: upperLeft.x + Math.floor((bottomRight.x - upperLeft.x) / 2),
            screenY: upperLeft.y + Math.floor((bottomRight.y - upperLeft.y) / 2)
        }
    }

    onGoToPlayer(event: GoToPlayerEvent) {
        let unused = null;
        this.clearTarget();
        [this.target, unused] = placeName(this.game, event.player);
        this.intervalID = setInterval(() => this.goTo(), 1)
    }

    private goTo() {
        const { screenX, screenY } = this.screenCenter()
        const screenMapCenter = new Cell(screenX, screenY)

        if (manhattanDist(screenMapCenter, this.target) < 2) {
            this.clearTarget()
            return
        }


        const dX = Math.abs(screenMapCenter.x - this.target.x)
        if (dX > 2) {
            const offsetDx = Math.max(1, Math.floor(dX / 25))
            if (screenMapCenter.x > this.target.x) {
                this.offsetX -= offsetDx
            } else {
                this.offsetX += offsetDx
            }
        }
        const dY = Math.abs(screenMapCenter.y - this.target.y)
        if (dY > 2) {
            const offsetDy = Math.max(1, Math.floor(dY / 25))
            if (screenMapCenter.y > this.target.y) {
                this.offsetY -= offsetDy
            } else {
                this.offsetY += offsetDy
            }
        }
    }

    onZoom(event: ZoomEvent) {
        this.clearTarget()
        const oldScale = this.scale;
        const zoomFactor = 1 + event.delta / 600;
        this.scale /= zoomFactor;

        // Clamp the scale to prevent extreme zooming
        this.scale = Math.max(0.5, Math.min(20, this.scale));

        const canvasRect = this.boundingRect()
        const canvasX = event.x - canvasRect.left;
        const canvasY = event.y - canvasRect.top;

        // Calculate the world point we want to zoom towards
        const zoomPointX = (canvasX - this.game.width() / 2) / oldScale + this.offsetX;
        const zoomPointY = (canvasY - this.game.height() / 2) / oldScale + this.offsetY;

        // Adjust the offset
        this.offsetX = zoomPointX - (canvasX - this.game.width() / 2) / this.scale;
        this.offsetY = zoomPointY - (canvasY - this.game.height() / 2) / this.scale;
    }

    onMove(event: DragEvent) {
        this.clearTarget()
        this.offsetX -= event.deltaX / this.scale;
        this.offsetY -= event.deltaY / this.scale;
    }

    private clearTarget() {
        if (this.intervalID != null) {
            clearInterval(this.intervalID)
            this.intervalID = null
        }
        this.target = null
    }
}