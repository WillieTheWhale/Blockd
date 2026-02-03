"""
Business logic services for AI Detection Service
"""
from .detection_service import get_detection_service, DetectionService
from .llm_service import get_llm_service, LLMService, LLMResult, LLMResultStatus
from .similarity_service import get_similarity_service, SimilarityService
from .question_extraction_service import (
    get_question_extraction_service,
    QuestionExtractionService,
    ExtractedQuestion
)
from .mode_collapse_service import (
    get_mode_collapse_service,
    ModeCollapseService,
    ModeCollapseResult,
    GlobalQuestion
)

__all__ = [
    # Detection
    'get_detection_service',
    'DetectionService',
    # LLM
    'get_llm_service',
    'LLMService',
    'LLMResult',
    'LLMResultStatus',
    # Similarity
    'get_similarity_service',
    'SimilarityService',
    # Question Extraction
    'get_question_extraction_service',
    'QuestionExtractionService',
    'ExtractedQuestion',
    # Mode Collapse
    'get_mode_collapse_service',
    'ModeCollapseService',
    'ModeCollapseResult',
    'GlobalQuestion',
]
