from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from typing import List, Dict
from collections import Counter
import uuid
import logging
from fastapi.middleware.cors import CORSMiddleware
from models import (
    Coord,
    Ship,
    CreateGameResponse,
    JoinGameRequest,
    JoinGameResponse,
    SetShipsRequest,
    ShootRequest
)


app = FastAPI()
SHIP_FLEET = {4: 1, 3: 2, 2: 3, 1: 4}

# CORS middleware должен быть добавлен только один раз в начале
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

games: Dict[str, dict] = {}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]  # только в консоль
)

logger = logging.getLogger(__name__)

# пример использования
logger.info("FastAPI server started")

@app.get("/")
def root():
    return {"message": "Battle Ship API is running"}

@app.post("/create_game", response_model=CreateGameResponse)
async def create_game():
    game_id = str(uuid.uuid4())[:8]
    player_id = str(uuid.uuid4())[:8]
    games[game_id] = {
        "players": {
            player_id: {
                "ships": [],
                "hits": [],
                "ready": False,
                "board": [[None for _ in range(10)] for _ in range(10)]
            }
        },
        "turn": player_id,
        "winner": None,
        "status": "waiting"
    }
    return {"game_id": game_id, "player_id": player_id}

@app.post("/join_game", response_model=JoinGameResponse)
async def join_game(request: JoinGameRequest):
    game = games.get(request.game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if len(game["players"]) >= 2:
        raise HTTPException(status_code=400, detail="Game is full")

    player_id = str(uuid.uuid4())[:8]
    game["players"][player_id] = {
        "ships": [],
        "hits": [],
        "ready": False,
        "board": [[None for _ in range(10)] for _ in range(10)]
    }

    if len(game["players"]) == 2:
        game["status"] = "ready"

    return {"game_id": request.game_id, "player_id": player_id}


@app.post("/set_ships")
async def set_ships(request: SetShipsRequest):
    game = games.get(request.game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    player = game["players"].get(request.player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # 1. Проверка состава флота
    ship_lengths = [len(ship.coordinates) for ship in request.ships]
    if Counter(ship_lengths) != SHIP_FLEET:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fleet composition. Expected: {SHIP_FLEET}, got: {Counter(ship_lengths)}"
        )

    # 2. Проверка координат кораблей
    all_coords = []
    for ship in request.ships:
        length = len(ship.coordinates)
        if not 1 <= length <= 4:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid ship length {length}. Must be between 1 and 4"
            )

        # Проверка позиций и пересечений
        for coord in ship.coordinates:
            if not (0 <= coord.x < 10 and 0 <= coord.y < 10):
                raise HTTPException(
                    status_code=400,
                    detail=f"Ship out of bounds at ({coord.x}, {coord.y})"
                )

            if any(coord.x == c.x and coord.y == c.y for c in all_coords):
                raise HTTPException(
                    status_code=400,
                    detail=f"Ships overlap at ({coord.x}, {coord.y})"
                )

            all_coords.append(coord)

    # 3. Сохранение кораблей
    player["ships"] = request.ships
    player["ready"] = True

    # 4. Проверка готовности всех игроков
    if all(p["ready"] for p in game["players"].values()):
        game["status"] = "started"

    return {"status": "Ships set successfully"}


@app.post("/shoot")
async def shoot(request: ShootRequest):
    try:
        # 1. Валидация входных данных
        if not (0 <= request.x < 10 and 0 <= request.y < 10):
            raise HTTPException(
                status_code=400,
                detail="Coordinates must be between 0 and 9"
            )

        # 2. Получение игры и проверка ее существования
        game = games.get(request.game_id)
        if not game:
            raise HTTPException(
                status_code=404,
                detail="Game not found"
            )

        # 3. Проверка существования игрока
        if request.player_id not in game["players"]:
            raise HTTPException(
                status_code=404,
                detail="Player not found in this game"
            )

        # 4. Проверка статуса игры
        if game.get("winner"):
            return {
                "status": "Game over",
                "winner": game["winner"]
            }

        # 5. Проверка очереди хода
        current_player = game["players"][request.player_id]
        if request.player_id != game["turn"]:
            raise HTTPException(
                status_code=400,
                detail=f"Not your turn. Current turn: {game['turn']}"
            )

        # 6. Поиск противника
        opponents = [
            pid for pid in game["players"]
            if pid != request.player_id
        ]
        if not opponents:
            raise HTTPException(
                status_code=400,
                detail="Waiting for second player"
            )

        opponent = game["players"][opponents[0]]
        shot = Coord(x=request.x, y=request.y)

        # 7. Проверка на повторный выстрел
        if any(h.x == shot.x and h.y == shot.y for h in current_player["hits"]):
            raise HTTPException(
                status_code=400,
                detail="Already shot at this position"
            )

        # 8. Логика определения попадания
        hit = False
        destroyed_ship = None
        adjacent_cells = []

        for ship in opponent["ships"]:
            ship_cells = {(c.x, c.y) for c in ship.coordinates}
            if (shot.x, shot.y) in ship_cells:
                hit = True

                # Проверка на потопление
                all_hits = {(h.x, h.y) for h in current_player["hits"]}
                ship_destroyed = ship_cells.issubset(all_hits | {(shot.x, shot.y)})

                if ship_destroyed:
                    destroyed_ship = ship
                    adjacent_cells = get_adjacent_cells(list(ship_cells))
                    # Добавляем промахи вокруг корабля
                    for cell in adjacent_cells:
                        cell_tuple = (cell["x"], cell["y"])
                        if cell_tuple not in all_hits:
                            current_player["hits"].append(Coord(x=cell["x"], y=cell["y"]))
                break

        # 9. Обновление состояния
        current_player["hits"].append(shot)

        # 10. Проверка победы
        all_hits = {(h.x, h.y) for h in current_player["hits"]}
        all_ships_destroyed = all(
            {(c.x, c.y) for c in ship.coordinates}.issubset(all_hits)
            for ship in opponent["ships"]
        )

        if all_ships_destroyed:
            game["winner"] = request.player_id
        elif not hit:
            game["turn"] = opponents[0]

        return {
            "result": "hit" if hit else "miss",
            "next_turn": game["turn"],
            "winner": game.get("winner"),
            "sunk": bool(destroyed_ship),
            "adjacent": adjacent_cells
        }

    except Exception as e:
        print(f"Error in shoot: {str(e)}")
        print(f"Request data: {request.dict()}")
        if 'game' in locals():
            print(f"Game state: {game}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

def get_adjacent_cells(ship_cells: list[tuple[int, int]]) -> list[dict]:
    directions = [(-1, -1), (-1, 0), (-1, 1),
                  (0, -1),           (0, 1),
                  (1, -1),  (1, 0),  (1, 1)]

    adjacent = set()

    for x, y in ship_cells:
        for dx, dy in directions:
            nx, ny = x + dx, y + dy
            if 0 <= nx < 10 and 0 <= ny < 10 and (nx, ny) not in ship_cells:
                adjacent.add((nx, ny))

    return [{"x": x, "y": y} for x, y in adjacent]

app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn, os
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))