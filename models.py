from pydantic import BaseModel, Field
from typing import List, Set, Tuple, Dict, Optional


def is_contiguous(coords: List['Coord']) -> bool:
    """Проверяет, что координаты корабля идут подряд"""
    xs = {c.x for c in coords}
    ys = {c.y for c in coords}
    return len(xs) == 1 or len(ys) == 1


class Coord(BaseModel):
    x: int
    y: int


class Ship(BaseModel):
    coordinates: List[Coord]

    @property
    def cells(self) -> Set[Tuple[int, int]]:
        return {(c.x, c.y) for c in self.coordinates}


# Модели запросов/ответов API
class CreateGameResponse(BaseModel):
    game_id: str = Field(..., description="ID созданной игры")
    player_id: str = Field(..., description="ID первого игрока")


class JoinGameRequest(BaseModel):
    game_id: str = Field(..., description="ID игры для подключения")


class JoinGameResponse(BaseModel):
    game_id: str = Field(..., description="ID игры")
    player_id: str = Field(..., description="ID второго игрока")


class SetShipsRequest(BaseModel):
    game_id: str = Field(..., description="ID игры")
    player_id: str = Field(..., description="ID игрока")
    ships: List[Ship] = Field(
        ...,
        min_items=10,
        max_items=10,
        description="10 кораблей (4×1, 3×2, 2×3, 1×4)"
    )


class ShootRequest(BaseModel):
    game_id: str = Field(..., description="ID игры")
    player_id: str = Field(..., description="ID игрока")
    x: int = Field(..., ge=0, le=9, description="Координата X (0-9)")
    y: int = Field(..., ge=0, le=9, description="Координата Y (0-9)")