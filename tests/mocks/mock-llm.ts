/**
 * Mock LLM API Server for Testing
 *
 * Provides mock responses for OpenAI, Anthropic, and Google AI APIs
 * to test AI detection functionality without real API calls.
 */

import { EventEmitter } from 'events';

export interface MockLLMResponse {
  model: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  embeddings?: number[];
}

export class MockLLMServer extends EventEmitter {
  private requestCount: Map<string, number> = new Map();
  private responseDelay: number = 100; // Default 100ms delay
  private failureRate: number = 0; // 0 = no failures, 1 = all failures

  /**
   * Generate a mock AI answer for a given question
   */
  async generateAnswer(
    question: string,
    model: 'gpt-4' | 'claude-3' | 'gemini-pro' = 'gpt-4'
  ): Promise<MockLLMResponse> {
    this.incrementRequestCount(model);
    await this.simulateDelay();

    if (this.shouldSimulateFailure()) {
      throw new Error(`Mock ${model} API error: Rate limit exceeded`);
    }

    const content = this.generateMockAnswer(question, model);
    const response: MockLLMResponse = {
      model,
      content,
      usage: {
        promptTokens: Math.floor(question.length / 4),
        completionTokens: Math.floor(content.length / 4),
        totalTokens: Math.floor((question.length + content.length) / 4),
      },
    };

    this.emit('answer_generated', { model, question, response });
    return response;
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbeddings(
    text: string,
    model: 'text-embedding-ada-002' | 'claude-embeddings' = 'text-embedding-ada-002'
  ): Promise<number[]> {
    this.incrementRequestCount(model);
    await this.simulateDelay();

    if (this.shouldSimulateFailure()) {
      throw new Error(`Mock ${model} API error: Service unavailable`);
    }

    // Generate deterministic embeddings based on text hash
    const embeddings = this.generateDeterministicEmbeddings(text);

    this.emit('embeddings_generated', { model, text, embeddings });
    return embeddings;
  }

  /**
   * Calculate similarity between two texts
   */
  async calculateSimilarity(text1: string, text2: string): Promise<number> {
    const embeddings1 = await this.generateEmbeddings(text1);
    const embeddings2 = await this.generateEmbeddings(text2);

    // Calculate cosine similarity
    const similarity = this.cosineSimilarity(embeddings1, embeddings2);

    this.emit('similarity_calculated', { text1, text2, similarity });
    return similarity;
  }

  /**
   * Generate mock answer based on model
   */
  private generateMockAnswer(question: string, model: string): string {
    const answers = {
      'gpt-4': `Certainly! I'd be happy to help explain this concept in detail.

First, let's break down the key components of "${question}":

1. The fundamental principle involves understanding the core concepts
2. This approach ensures optimal performance and scalability
3. Best practices suggest implementing robust error handling

**Implementation Details:**
The implementation should follow industry standards and leverage modern frameworks to achieve the desired functionality.

**Summary:**
In summary, the most effective solution combines theoretical knowledge with practical implementation. This approach ensures that we maintain code quality while achieving our objectives efficiently.

Would you like me to elaborate on any specific aspect of this implementation?`,

      'claude-3': `I'll provide a comprehensive explanation of this topic.

**Key Points to Consider:**

• First important consideration: Understanding the fundamentals
• Second critical aspect: Implementing best practices
• Third essential element: Maintaining code quality

**Detailed Analysis:**
When approaching "${question}", it's important to consider multiple perspectives and ensure that the solution is both scalable and maintainable. The implementation should leverage modern technologies while adhering to established design patterns.

**Conclusion:**
This methodology provides a robust framework for addressing the requirements effectively and efficiently.`,

      'gemini-pro': `Let me break this down systematically.

**Understanding the Question:**
"${question}"

**Core Concepts:**
1. Fundamental principles of the technology
2. Best practices and common patterns
3. Real-world applications and use cases

**Implementation Approach:**
The recommended approach involves:
- Setting up the necessary infrastructure
- Implementing the core functionality with proper error handling
- Testing thoroughly to ensure reliability
- Optimizing for performance and scalability

**Best Practices:**
Following industry-standard practices ensures maintainability and long-term success of the implementation.`,
    };

    return answers[model as keyof typeof answers] || answers['gpt-4'];
  }

  /**
   * Generate deterministic embeddings (for consistent testing)
   */
  private generateDeterministicEmbeddings(text: string, dimension: number = 1536): number[] {
    const embeddings: number[] = [];
    const seed = this.hashString(text);

    for (let i = 0; i < dimension; i++) {
      // Generate pseudo-random but deterministic values
      const value = Math.sin(seed + i) * Math.cos(seed * i);
      embeddings.push(value);
    }

    // Normalize the vector
    const magnitude = Math.sqrt(
      embeddings.reduce((sum, val) => sum + val * val, 0)
    );

    return embeddings.map((val) => val / magnitude);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }

    return dotProduct / (mag1 * mag2);
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Simulate API delay
   */
  private async simulateDelay(): Promise<void> {
    if (this.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelay));
    }
  }

  /**
   * Check if we should simulate a failure
   */
  private shouldSimulateFailure(): boolean {
    return Math.random() < this.failureRate;
  }

  /**
   * Increment request count for a model
   */
  private incrementRequestCount(model: string): void {
    const count = this.requestCount.get(model) || 0;
    this.requestCount.set(model, count + 1);
  }

  /**
   * Get request count for a model
   */
  getRequestCount(model: string): number {
    return this.requestCount.get(model) || 0;
  }

  /**
   * Get total request count across all models
   */
  getTotalRequestCount(): number {
    let total = 0;
    this.requestCount.forEach((count) => {
      total += count;
    });
    return total;
  }

  /**
   * Set response delay in milliseconds
   */
  setResponseDelay(delayMs: number): void {
    this.responseDelay = delayMs;
  }

  /**
   * Set failure rate (0-1)
   */
  setFailureRate(rate: number): void {
    if (rate < 0 || rate > 1) {
      throw new Error('Failure rate must be between 0 and 1');
    }
    this.failureRate = rate;
  }

  /**
   * Reset mock server state
   */
  reset(): void {
    this.requestCount.clear();
    this.responseDelay = 100;
    this.failureRate = 0;
    this.emit('reset');
  }

  /**
   * Mock AI detection analysis
   */
  async analyzeAnswer(question: string, answer: string): Promise<{
    riskScore: number;
    similarityScores: Array<{ model: string; score: number }>;
    flags: string[];
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    await this.simulateDelay();

    // Generate AI answers for comparison
    const gptAnswer = await this.generateAnswer(question, 'gpt-4');
    const claudeAnswer = await this.generateAnswer(question, 'claude-3');
    const geminiAnswer = await this.generateAnswer(question, 'gemini-pro');

    // Calculate similarities
    const gptSimilarity = await this.calculateSimilarity(answer, gptAnswer.content);
    const claudeSimilarity = await this.calculateSimilarity(answer, claudeAnswer.content);
    const geminiSimilarity = await this.calculateSimilarity(answer, geminiAnswer.content);

    const maxSimilarity = Math.max(gptSimilarity, claudeSimilarity, geminiSimilarity);

    // Detect AI patterns
    const flags: string[] = [];

    if (answer.includes('Certainly!') || answer.includes("I'd be happy to")) {
      flags.push('Formal greeting typical of AI');
    }

    if (answer.includes('**') || answer.match(/\d+\./)) {
      flags.push('Structured formatting with bullets/numbers');
    }

    if (answer.includes('In summary') || answer.includes('In conclusion')) {
      flags.push('Formal conclusion markers');
    }

    if (answer.length > 500 && !answer.match(/um|uh|like|you know|kinda|sorta/i)) {
      flags.push('Long, formal answer without filler words');
    }

    // Calculate risk score
    const riskScore = (maxSimilarity * 0.7 + flags.length * 0.1);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high';
    if (riskScore > 0.7) {
      riskLevel = 'high';
    } else if (riskScore > 0.4) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    const result = {
      riskScore: Math.min(riskScore, 1),
      similarityScores: [
        { model: 'gpt-4', score: gptSimilarity },
        { model: 'claude-3', score: claudeSimilarity },
        { model: 'gemini-pro', score: geminiSimilarity },
      ],
      flags,
      riskLevel,
    };

    this.emit('analysis_complete', { question, answer, result });
    return result;
  }
}

// Create singleton instance
let mockLLMInstance: MockLLMServer | null = null;

/**
 * Get or create mock LLM server instance
 */
export function getMockLLMServer(): MockLLMServer {
  if (!mockLLMInstance) {
    mockLLMInstance = new MockLLMServer();
  }
  return mockLLMInstance;
}

/**
 * Reset mock LLM server
 */
export function resetMockLLMServer(): void {
  if (mockLLMInstance) {
    mockLLMInstance.reset();
  } else {
    mockLLMInstance = new MockLLMServer();
  }
}

export default MockLLMServer;
