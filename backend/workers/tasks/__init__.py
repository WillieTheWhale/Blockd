"""
Celery Tasks Package for Blockd Platform
"""

from tasks import video, ai, security, gaze, timing

__all__ = ['video', 'ai', 'security', 'gaze', 'timing']
