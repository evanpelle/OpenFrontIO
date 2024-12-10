import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Layer } from './Layer';
import { Game, Player } from '../../../core/game/Game';
import { ClientID } from '../../../core/Schemas';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { EventBus, GameEvent } from '../../../core/EventBus';

interface Entry {
  name: string
  position: number
  score: string
  isMyPlayer: boolean
  player: Player
}

export class GoToPlayerEvent implements GameEvent {
  constructor(public player: Player) { }
}

@customElement('leader-board')
export class Leaderboard extends LitElement implements Layer {

  private game: Game
  public clientID: ClientID
  public eventBus: EventBus

  init(game: Game) {
    this.game = game
  }

  tick() {
    if (this._hidden && !this.game.inSpawnPhase()) {
      this.showLeaderboard()
      this.updateLeaderboard()
    }
    if (this._hidden) {
      return
    }

    if (this.game.ticks() % 10 == 0) {
      this.updateLeaderboard()
    }
  }

  private updateLeaderboard() {
    if (this.clientID == null) {
      return
    }
    const myPlayer = this.game.players().find(p => p.clientID() == this.clientID)

    const sorted = this.game.players()
      .sort((a, b) => b.numTilesOwned() - a.numTilesOwned())

    this.players = sorted
      .slice(0, 5)
      .map((player, index) => ({
        name: player.displayName(),
        position: index + 1,
        score: formatPercentage(player.numTilesOwned() / this.game.numLandTiles()),
        isMyPlayer: player == myPlayer,
        player: player
      }));

    if (myPlayer != null && this.players.find(p => p.isMyPlayer) == null) {
      let place = 0
      for (const p of sorted) {
        place++
        if (p == myPlayer) {
          break
        }
      }

      this.players.pop()
      this.players.push({
        name: myPlayer.displayName(),
        position: place,
        score: formatPercentage(myPlayer.numTilesOwned() / this.game.numLandTiles()),
        isMyPlayer: true,
        player: myPlayer
      })
    }

    this.requestUpdate()
  }

  private handleRowClick(player: Player) {
    this.eventBus.emit(new GoToPlayerEvent(player))
  }

  renderLayer(context: CanvasRenderingContext2D) {
  }
  shouldTransform(): boolean {
    return false
  }

  static styles = css`
  :host {
    display: block;
  }
  img.emoji {
    height: 1em;
    width: auto;
  }
  .leaderboard {
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 9999;
    background-color: rgba(30, 30, 30, 0.7);
    padding: 10px;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    border-radius: 10px;
    max-width: 300px;
    max-height: 80vh;
    overflow-y: auto;
    width: 300px;
    backdrop-filter: blur(5px);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    padding: 8px;
    text-align: left;
    border-bottom: 1px solid rgba(51, 51, 51, 0.2);
    color: white;
  }
  th {
    background-color: rgba(44, 44, 44, 0.5);
    color: white;
  }
  .myPlayer {
    font-weight: bold;
    font-size: 1.5em;
  }
  .otherPlayer {
    font-size: 1.3em;
  }
  tr:nth-child(even) {
    background-color: rgba(44, 44, 44, 0.5);
  }
  tbody tr {
    cursor: pointer;
    transition: background-color 0.2s;
  }
  tbody tr:hover {
    background-color: rgba(78, 78, 78, 0.8);
  }
  .hidden {
    display: none !important;
  }
  @media (max-width: 1000px) {
    .leaderboard {
      display: none !important;
    }
  }
`;

  players: Entry[] = [];

  @state()
  private _hidden = true;

  render() {
    return html`
      <div class="leaderboard ${this._hidden ? 'hidden' : ''}">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Owned</th>
            </tr>
          </thead>
          <tbody>
            ${this.players
        .map((player) => html`
                <tr 
                  class="${player.isMyPlayer ? 'myPlayer' : 'otherPlayer'}"
                  @click=${() => this.handleRowClick(player.player)}
                >
                  <td>${player.position}</td>
                  <td>${unsafeHTML(player.name)}</td>
                  <td>${player.score}</td>
                </tr>
              `)}
          </tbody>
        </table>
      </div>
    `;
  }

  hideLeaderboard() {
    this._hidden = true;
    this.requestUpdate();
  }

  showLeaderboard() {
    this._hidden = false;
    this.requestUpdate();
  }

  get isVisible() {
    return !this._hidden;
  }
}

function formatPercentage(value: number): string {
  const perc = value * 100
  if (perc > 99.5) {
    return "100%"
  }
  if (perc < .01) {
    return "0%"
  }
  if (perc < .1) {
    return (perc).toPrecision(1) + '%'
  }
  return perc.toPrecision(2) + '%';
}