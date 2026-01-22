"""
Pydantic models for Loom modules
"""

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class ModuleType(str, Enum):
    LOG_ENTRY = "log_entry"
    AI_PROCESSOR = "ai_processor"
    SCRIPT_EXECUTION = "script_execution"
    DATA_INPUT = "data_input"


class ModuleStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"


class Position(BaseModel):
    x: float
    y: float


class Connection(BaseModel):
    module_id: str
    port_id: str


class Module(BaseModel):
    id: str
    type: ModuleType
    content: str = ""
    position: Position = Field(default_factory=lambda: Position(x=0, y=0))
    inputs: list[Connection] = Field(default_factory=list)
    outputs: dict[str, Any] = Field(default_factory=dict)
    status: ModuleStatus = ModuleStatus.IDLE
    metadata: dict[str, Any] = Field(default_factory=dict)


class ModuleCreate(BaseModel):
    type: ModuleType
    content: str = ""
    position: Optional[Position] = None


class ModuleUpdate(BaseModel):
    content: Optional[str] = None
    position: Optional[Position] = None
    status: Optional[ModuleStatus] = None
    metadata: Optional[dict[str, Any]] = None


class ChatRequest(BaseModel):
    prompt: str
    model: str = "llama2"
    context: Optional[list[str]] = None


class ChatResponse(BaseModel):
    content: str
    model: str
    tokens_used: int = 0
