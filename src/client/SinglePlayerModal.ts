import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Difficulty, GameMap, GameType } from '../core/game/Game';
import { generateGameID as generateGameID } from '../core/Util';

@customElement('single-player-modal')
export class SinglePlayerModal extends LitElement {
  @state() private isModalOpen = false;
  @state() private selectedMap: GameMap = GameMap.World;
  @state() private selectedDifficulty: Difficulty = Difficulty.Medium;

  static styles = css`
    .modal-overlay {
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
    }

    .modal-content {
      background-color: white;
      margin: 15% auto;
      padding: 20px;
      border-radius: 8px;
      width: 80%;
      max-width: 500px;
      text-align: center;
    }

    .close {
      color: #aaa;
      float: right;
      font-size: 28px;
      font-weight: bold;
      cursor: pointer;
    }

    .close:hover,
    .close:focus {
      color: black;
      text-decoration: none;
      cursor: pointer;
    }

    button {
      padding: 10px 20px;
      font-size: 16px;
      cursor: pointer;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      transition: background-color 0.3s;
      display: inline-block;
      margin-top: 20px;
    }

    button:hover {
      background-color: #0056b3;
    }

    select {
      padding: 8px;
      font-size: 16px;
      margin-top: 10px;
      width: 200px;
    }
  `;

  render() {
    return html`
      <div class="modal-overlay" style="display: ${this.isModalOpen ? 'block' : 'none'}">
        <div class="modal-content">
          <span class="close" @click=${this.close}>&times;</span>
          <h2>Start Single Player Game</h2>
          <div>
            <label for="map-select">Map: </label>
            <select id="map-select" @change=${this.handleMapChange}>
              ${Object.entries(GameMap)
        .filter(([key]) => isNaN(Number(key)))
        .map(([key, value]) => html`
                  <option value=${value} ?selected=${this.selectedMap === value}>
                    ${value}
                  </option>
                `)}
            </select>
          </div>
          <div>
            <label for="map-select">Difficulty: </label>
            <select id="map-select" @change=${this.handleDifficultyChange}>
              ${Object.entries(Difficulty)
        .filter(([key]) => isNaN(Number(key)))
        .map(([key, value]) => html`
                  <option value=${value} ?selected=${this.selectedDifficulty === value}>
                    ${value}
                  </option>
                `)}
            </select>
          </div>

          <button @click=${this.startGame}>Start Game</button>
        </div>
      </div>
    `;
  }

  public open() {
    this.isModalOpen = true;
  }

  public close() {
    this.isModalOpen = false;
  }

  private handleMapChange(e: Event) {
    this.selectedMap = String((e.target as HTMLSelectElement).value) as GameMap;
  }
  private handleDifficultyChange(e: Event) {
    this.selectedDifficulty = String((e.target as HTMLSelectElement).value) as Difficulty;
  }
  private startGame() {
    console.log(`Starting single player game with map: ${GameMap[this.selectedMap]}`);
    this.dispatchEvent(new CustomEvent('join-lobby', {
      detail: {
        gameType: GameType.Singleplayer,
        lobby: {
          id: generateGameID(),
        },
        map: this.selectedMap,
        difficulty: this.selectedDifficulty
      },
      bubbles: true,
      composed: true
    }));
    this.close();
  }
}