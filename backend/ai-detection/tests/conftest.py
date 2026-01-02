"""
Pytest configuration and fixtures
"""
import pytest
import os


@pytest.fixture(scope="session")
def test_config():
    """Test configuration"""
    # Set test environment variables
    os.environ["ENV"] = "test"
    os.environ["DEBUG"] = "true"
    os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_blockd"
    os.environ["REDIS_HOST"] = "localhost"
    os.environ["REDIS_PORT"] = "6379"


@pytest.fixture
def sample_question():
    """Sample interview question"""
    return "Explain the difference between process and thread in operating systems."


@pytest.fixture
def sample_human_answer():
    """Sample human answer"""
    return """
    A process is basically like a program that's running on your computer, um, and it has its own
    memory space. A thread is like a lighter version that runs inside a process and shares the
    same memory. So you can have multiple threads in one process, which makes things faster
    because they don't need to copy memory around.
    """


@pytest.fixture
def sample_ai_answer_gpt4():
    """Sample GPT-4 answer"""
    return """
    A process is an independent program in execution with its own allocated memory space,
    including code, data, and system resources. Each process operates in isolation with
    protected memory boundaries enforced by the operating system. A thread, conversely,
    is a lightweight execution unit within a process that shares the process's memory space
    and resources. Multiple threads within a single process can execute concurrently,
    enabling efficient parallel processing while maintaining shared access to the same
    address space. This architecture makes threads more resource-efficient for concurrent
    operations compared to creating separate processes.
    """


@pytest.fixture
def sample_ai_answer_claude():
    """Sample Claude answer"""
    return """
    The fundamental distinction between processes and threads lies in their resource allocation
    and isolation characteristics. A process represents a complete, self-contained execution
    environment with dedicated virtual address space, file descriptors, and system resources.
    Processes are isolated from each other, providing strong security and stability guarantees.
    Threads, by contrast, are execution contexts within a process that share the same address
    space and resources, making inter-thread communication more efficient but requiring careful
    synchronization to prevent race conditions and ensure data consistency.
    """
