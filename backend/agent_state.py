import time

_state: dict = {
    "summary": "",
    "load_type": 0,
    "confidence": 0.0,
    "history": [],
    "last_intervention_time": 0.0,
    "last_intervention_load_type": 0,
    "store_map_data": None,
    "pending_actions": [],
}

MAX_HISTORY = 10
GLOBAL_INTERVENTION_COOLDOWN_S = 7.0   # minimum gap between any two interventions
SAME_LOAD_COOLDOWN_S = 7.0            # minimum gap before repeating the same load type

LOAD_NAMES = {0: "none", 1: "search", 2: "comparison", 3: "choice_overload", 4: "comprehension"}


def get_state() -> dict:
    return _state


def update_summary_and_load(summary: str, load_type: int, confidence: float):
    _state["summary"] = summary
    _state["load_type"] = load_type
    _state["confidence"] = confidence


def add_to_history(role: str, content: str):
    _state["history"].append({"role": role, "content": content})
    if len(_state["history"]) > MAX_HISTORY:
        _state["history"] = _state["history"][-MAX_HISTORY:]


def can_intervene(load_type: int) -> bool:
    now = time.time()
    elapsed = now - _state["last_intervention_time"]
    if elapsed < GLOBAL_INTERVENTION_COOLDOWN_S:
        return False
    if _state["last_intervention_load_type"] == load_type and elapsed < SAME_LOAD_COOLDOWN_S:
        return False
    return True


def record_intervention(load_type: int):
    _state["last_intervention_time"] = time.time()
    _state["last_intervention_load_type"] = load_type


def set_store_map_data(data: dict):
    _state["store_map_data"] = data


def get_store_map_data() -> dict | None:
    return _state["store_map_data"]


def set_pending_actions(actions: list):
    _state["pending_actions"] = actions


def get_pending_actions() -> list:
    return _state["pending_actions"]


def reset():
    _state["summary"] = ""
    _state["load_type"] = 0
    _state["confidence"] = 0.0
    _state["history"] = []
    _state["last_intervention_time"] = 0.0
    _state["last_intervention_load_type"] = 0
    _state["store_map_data"] = None
    _state["pending_actions"] = []
