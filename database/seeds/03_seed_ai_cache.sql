-- Seed AI Answer Cache for Blockd Platform
-- This script creates sample AI-generated answers with embeddings

-- Delete existing seed data (if re-running)
DELETE FROM ai_answer_cache WHERE question_text LIKE 'What is%' OR question_text LIKE 'Explain%';

-- Insert sample AI-generated answers
-- Note: Embeddings are placeholder vectors (in production, these would be real embeddings)
-- For testing, we use random-like but deterministic vectors

INSERT INTO ai_answer_cache (
    question_hash,
    question_text,
    model_name,
    answer_text,
    embedding,
    perplexity_score,
    token_count,
    metadata,
    created_at
)
VALUES
    -- Question 1: JavaScript closure (GPT-4)
    (
        '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p',
        'What is a closure in JavaScript?',
        'gpt-4',
        'A closure in JavaScript is a feature where an inner function has access to variables in its outer (enclosing) function''s scope, even after the outer function has returned. Closures are created every time a function is created, at function creation time. They allow functions to have "private" variables and enable patterns like data encapsulation and the module pattern.',
        array_fill(0.1, ARRAY[384])::vector(384),
        25.5,
        85,
        '{"temperature": 0.7, "max_tokens": 150, "timestamp": "2025-11-24T00:00:00Z"}',
        NOW()
    ),
    -- Question 1: JavaScript closure (Claude)
    (
        '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p',
        'What is a closure in JavaScript?',
        'claude-3-opus',
        'A closure is formed when a function is defined inside another function and the inner function references variables from the outer function''s scope. The inner function maintains access to these variables even after the outer function has finished executing. This happens because JavaScript functions create a persistent scope chain that captures the lexical environment where they were defined.',
        array_fill(0.12, ARRAY[384])::vector(384),
        22.3,
        92,
        '{"temperature": 0.7, "max_tokens": 150, "timestamp": "2025-11-24T00:00:00Z"}',
        NOW()
    ),
    -- Question 2: Database indexing (GPT-3.5)
    (
        '2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q',
        'Explain database indexing and its benefits',
        'gpt-3.5-turbo',
        'Database indexing is a data structure technique used to quickly locate and access data in a database table. An index creates a separate structure that holds a subset of the table''s data along with pointers to the corresponding rows. Benefits include: 1) Faster query performance for SELECT operations, 2) Quicker sorting and grouping, 3) Efficient enforcement of uniqueness constraints. However, indexes also have costs: they use additional storage and slow down INSERT/UPDATE/DELETE operations.',
        array_fill(0.15, ARRAY[384])::vector(384),
        18.7,
        105,
        '{"temperature": 0.7, "max_tokens": 200, "timestamp": "2025-11-24T00:00:00Z"}',
        NOW()
    ),
    -- Question 3: Machine Learning (GPT-4)
    (
        '3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r',
        'What is the difference between supervised and unsupervised learning?',
        'gpt-4',
        'Supervised learning uses labeled training data where each input has a corresponding correct output. The algorithm learns to map inputs to outputs. Examples include classification and regression. Unsupervised learning works with unlabeled data, finding patterns and structure without predetermined outputs. Examples include clustering and dimensionality reduction. The key difference is that supervised learning has a "teacher" (labels) guiding the learning process, while unsupervised learning discovers hidden patterns independently.',
        array_fill(0.08, ARRAY[384])::vector(384),
        28.2,
        112,
        '{"temperature": 0.7, "max_tokens": 200, "timestamp": "2025-11-24T00:00:00Z"}',
        NOW()
    ),
    -- Question 4: REST API (Gemini)
    (
        '4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s',
        'Explain REST API principles',
        'gemini-pro',
        'REST (Representational State Transfer) APIs follow these key principles: 1) Client-Server Architecture: separation of concerns between UI and data storage. 2) Statelessness: each request contains all information needed to process it. 3) Cacheability: responses must define themselves as cacheable or not. 4) Uniform Interface: standardized way of communicating between client and server. 5) Layered System: client cannot tell if connected directly to end server. 6) Code on Demand (optional): servers can extend client functionality.',
        array_fill(0.11, ARRAY[384])::vector(384),
        20.1,
        125,
        '{"temperature": 0.7, "max_tokens": 250, "timestamp": "2025-11-24T00:00:00Z"}',
        NOW()
    ),
    -- Question 5: Python decorators (Claude)
    (
        '5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t',
        'What are Python decorators and how do they work?',
        'claude-3-sonnet',
        'Python decorators are a powerful feature that allows you to modify or enhance functions and methods without changing their source code. A decorator is a callable that takes a function as an argument and returns a new function. They use the @ symbol for syntactic sugar. Common uses include logging, timing, authentication, and caching. Decorators work by wrapping the original function, allowing you to execute code before and/or after the wrapped function runs.',
        array_fill(0.09, ARRAY[384])::vector(384),
        23.8,
        98,
        '{"temperature": 0.7, "max_tokens": 180, "timestamp": "2025-11-24T00:00:00Z"}',
        NOW()
    );

-- Create more varied embeddings for realistic similarity testing
-- Update embeddings with slight variations
UPDATE ai_answer_cache
SET embedding = (
    SELECT array_agg(
        CASE
            WHEN i % 10 = 0 THEN (random() * 0.2)::float
            WHEN i % 5 = 0 THEN (random() * 0.15 + 0.05)::float
            ELSE (random() * 0.1 + 0.1)::float
        END
    )::vector(384)
    FROM generate_series(1, 384) AS i
)
WHERE question_hash = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p';

-- Display seeded AI cache entries
SELECT
    LEFT(question_text, 50) AS question,
    model_name,
    perplexity_score,
    token_count,
    LEFT(answer_text, 100) || '...' AS answer_preview
FROM ai_answer_cache
WHERE question_text LIKE 'What is%' OR question_text LIKE 'Explain%'
ORDER BY question_text, model_name;

-- Show total count
SELECT COUNT(*) AS total_ai_cache_entries FROM ai_answer_cache;
