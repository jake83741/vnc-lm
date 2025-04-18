// src/managers/search/vectorstore.ts
export class VectorStore {
  public static instance: VectorStore | null = null;
  private termDocumentFrequency: Record<string, number> = {};
  private documents: Array<{
    id: string;
    content: string;
    metadata: { url: string, title: string, source?: string };
    embedding: number[];
  }> = [];
  private initialized = false;
  private stopWords = new Set([
    'the', 'and', 'or', 'of', 'to', 'a', 'in', 'that', 'it', 'is', 'was', 'for', 
    'on', 'with', 'as', 'be', 'at', 'this', 'but', 'by', 'from', 'an', 'not', 
    'what', 'all', 'are', 'were', 'when', 'we', 'you', 'they', 'have', 'had'
  ]);

  private constructor() {}

  private static extractTimestamp(content: string, url: string): number {
    // Try to find dates in the content using natural language processing techniques
    const dateRegexes = [
      /(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/g,                      // DD/MM/YYYY
      /(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/g,                      // YYYY/MM/DD
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{1,2},? \d{4}/gi, // Month DD, YYYY
      /\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*,? \d{4}/gi, // DD Month YYYY
      /published|updated|posted on:?\s.{1,20}?(\d{4})/i                // "Published/Updated on" followed by text with year
    ];
    
    for (const regex of dateRegexes) {
      const matches = content.match(regex);
      if (matches && matches.length > 0) {
        try {
          // Take the first date found (usually most prominent)
          const timestamp = new Date(matches[0]).getTime();
          if (!isNaN(timestamp)) return timestamp;
        } catch (e) {
          // Continue to next pattern if parsing fails
        }
      }
    }
    
    // Fallback: Use URL patterns to estimate age
    if (url.includes("/2025/")) return new Date("2025-01-01").getTime();
    if (url.includes("/2024/")) return new Date("2024-01-01").getTime();
    
    // Default: Use a more recent but not too recent timestamp (3 months ago)
    const defaultDate = new Date();
    defaultDate.setMonth(defaultDate.getMonth() - 3);
    return defaultDate.getTime();
  }
  
  private static calculateRecencyBoost(query: string, timestamp: number): number {
    const currentTime = Date.now();
    const ageInDays = (currentTime - timestamp) / (1000 * 60 * 60 * 24);
    
    // Detect time-sensitive queries
    const timeKeywords = ['recent', 'latest', 'new', 'current', 'today', 'yesterday', 'last week', '2025', '2024'];
    const isTimeSensitiveQuery = timeKeywords.some(keyword => 
      query.toLowerCase().includes(keyword)
    );
    
    // Dynamic decay rate based on query nature
    const decayRate = isTimeSensitiveQuery ? 0.015 : 0.005;
    
    // Calculate boost with exponential decay
    const recencyBoost = Math.exp(-decayRate * ageInDays);
    
    // Normalize boost value (0.5 to 1.5 range)
    return 0.5 + recencyBoost;
  }

  // SECTION 1: INSTANCE MANAGEMENT AND INITIALIZATION
  
  public static getInstance(): VectorStore {
    if (!VectorStore.instance) {
      VectorStore.instance = new VectorStore();
    }
    return VectorStore.instance;
  }

  public async initialize(): Promise<boolean> {
    try {
      this.documents = [];
      this.initialized = true;
      return true;
    } catch (error) {
      console.error("[VectorStore] Initialization failed:", error);
      return false;
    }
  }

  public async close(): Promise<void> {
    this.documents = [];
    this.initialized = false;
  }

  // SECTION 2: TEXT PROCESSING AND EMBEDDING

  private cleanText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
  }

  private updateDocumentFrequency(text: string) {
    const terms = new Set(this.cleanText(text).split(/\s+/));
    terms.forEach(term => {
      if (term.length > 2 && !this.stopWords.has(term)) {
        this.termDocumentFrequency[term] = (this.termDocumentFrequency[term] || 0) + 1;
      }
    });
  }

  private createEmbedding(text: string): number[] {
    // Step 1: Clean and tokenize text
    const cleanedText = this.cleanText(text);
    const words = cleanedText.split(/\s+/);
    
    // Step 2: Extract features (unigrams and bigrams)
    const features = this.extractFeatures(words);
    
    // Step 3: Apply positional weighting
    const posWeightedFeatures = this.applyPositionalWeighting(features, words);
    
    // Step 4: Apply IDF weighting
    const idfWeightedFeatures = this.applyIdfWeighting(posWeightedFeatures);
    
    // Step 5: Create the embedding vector
    return this.createEmbeddingVector(idfWeightedFeatures, words.length);
  }

  private extractFeatures(words: string[]): Record<string, number> {
    const features: Record<string, number> = {};
    
    // Process unigrams (single words)
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.length > 2 && !this.stopWords.has(word)) {
        features[word] = (features[word] || 0) + 1;
      }
    }
    
    // Process bigrams (pairs of words)
    for (let i = 0; i < words.length - 1; i++) {
      const word1 = words[i];
      const word2 = words[i + 1];
      if (word1.length > 2 && word2.length > 2 && 
          !this.stopWords.has(word1) && !this.stopWords.has(word2)) {
        const bigram = `${word1}_${word2}`;
        features[bigram] = (features[bigram] || 0) + 0.8; // Lower weight for bigrams
      }
    }
    
    return features;
  }

  private applyPositionalWeighting(features: Record<string, number>, words: string[]): Record<string, number> {
    return Object.fromEntries(
      Object.entries(features).map(([feature, count]) => {
        const firstPosition = words.findIndex(w => w === feature || feature.startsWith(w + '_'));
        if (firstPosition !== -1) {
          // Words earlier in text get higher weight (title/intro often contains key concepts)
          const posWeight = 1.0 - (Math.min(firstPosition, 100) / 100) * 0.5;
          return [feature, count * posWeight];
        }
        return [feature, count];
      })
    );
  }

  private applyIdfWeighting(features: Record<string, number>): Record<string, number> {
    const idfWeightedFeatures: Record<string, number> = {};
    const totalDocs = Math.max(this.documents.length, 1); // Prevent division by zero
    
    Object.entries(features).forEach(([feature, count]) => {
      // Get document frequency for this feature (default to 0.5 if not found)
      const docFreq = this.termDocumentFrequency?.[feature] || 0.5;
      // Calculate IDF with smoothing to avoid log(0)
      const idf = Math.log(totalDocs / (docFreq + 0.5)) + 1.0; // +1 to ensure positive weights
      // Apply IDF weight to existing feature weight
      idfWeightedFeatures[feature] = count * idf;
    });
    
    return idfWeightedFeatures;
  }

  private createEmbeddingVector(features: Record<string, number>, wordCount: number): number[] {
    // Get the top 128 most significant features
    const topFeatures = Object.entries(features)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 128)
      .map(entry => entry[0]);
    
    // Create the embedding vector
    const embedding = new Array(128).fill(0);
    const normalizer = wordCount || 1;
    
    topFeatures.forEach((feature, index) => {
      embedding[index] = features[feature] / normalizer;
    });
    
    return embedding;
  }

  // SECTION 3: SIMILARITY AND RELEVANCE SCORING

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < Math.min(vecA.length, vecB.length); i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    // Basic cosine similarity
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    
    // Apply a penalty for very short chunks
    const nonZeroA = vecA.filter(v => v > 0).length;
    const nonZeroB = vecB.filter(v => v > 0).length;
    const lengthRatio = Math.min(nonZeroA, nonZeroB) / Math.max(nonZeroA, nonZeroB, 1);
    
    return similarity * (0.7 + 0.3 * lengthRatio);
  }

  private contentSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.cleanText(text1).split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(this.cleanText(text2).split(/\s+/).filter(w => w.length > 2));
    
    let commonWords = 0;
    words1.forEach(word => {
      if (words2.has(word)) commonWords++;
    });
    
    const totalUniqueWords = words1.size + words2.size - commonWords;
    return totalUniqueWords > 0 ? commonWords / totalUniqueWords : 0;
  }

  private extractQueryKeyTerms(queryText: string): string[] {
    const cleaned = this.cleanText(queryText);
    const words = cleaned.split(/\s+/);
    
    // Filter out stop words and short words
    return words.filter(word => 
      word.length > 3 && !this.stopWords.has(word)
    );
  }

  private calculateTermPresenceScore(content: string, queryTerms: string[]): number {
    if (queryTerms.length === 0) return 0;
    
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    const totalDocs = Math.max(this.documents.length, 1);
    
    let score = 0;
    let matchedTerms = 0;
    
    sentences.forEach(sentence => {
      const cleanedSentence = this.cleanText(sentence);
      let sentenceScore = 0;
      let sentenceMatches = 0;
      
      queryTerms.forEach(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        if (regex.test(cleanedSentence)) {
          sentenceMatches++;
          
          // Apply IDF weighting
          const docFreq = this.termDocumentFrequency?.[term] || 0.5;
          const idf = Math.log(totalDocs / (docFreq + 0.5)) + 1.0;
          sentenceScore += 0.35 * idf;
        }
      });
      
      // Apply density boosting
      if (sentenceMatches > 1) {
        sentenceScore *= 1.0 + (sentenceMatches / queryTerms.length) * 1.5;
      }
      
      score += sentenceScore;
      matchedTerms = Math.max(matchedTerms, sentenceMatches);
    });
    
    // Apply coverage boost
    const termCoverageRatio = matchedTerms / queryTerms.length;
    const coverageBoost = termCoverageRatio * 0.8;
    
    return score * (0.4 + coverageBoost);
  }

  // SECTION 4: DOCUMENT PROCESSING AND CHUNKING

  public async addDocuments(documents: Array<{ url: string, title: string, content: string, source?: string }>): Promise<boolean> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) return false;
    }
  
    try {
      let totalChunks = 0;
      
      documents.forEach((doc, docIndex) => {
        // Create content chunks
        const chunks = this.createContentChunks(doc.content, doc.title);
        
        // Process and embed each chunk
        chunks.forEach((chunk, chunkIndex) => {
          // Update document frequency data for IDF calculation
          this.updateDocumentFrequency(chunk);
          
          // Create embedding
          const embedding = this.createEmbedding(chunk);
          
          // Store the document with its embedding
          this.documents.push({
            id: `doc${docIndex}_chunk${chunkIndex}`,
            content: chunk,
            metadata: { 
              url: doc.url, 
              title: doc.title,
              source: doc.source 
            },
            embedding
          });
          
          totalChunks++;
        });
      });
      
      return true;
    } catch (error) {
      console.error("[VectorStore] Error adding documents:", error);
      return false;
    }
  }

  private createContentChunks(content: string, title?: string): string[] {
    const paragraphs = content
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    let chunks: string[] = [];
    
    // Use paragraph-based chunking if multiple paragraphs are available
    if (paragraphs.length > 1) {
      chunks = this.createChunksFromParagraphs(paragraphs);
    } else {
      chunks = this.createChunksFromSentences(content);
    }
    
    // Add title to the first chunk if available
    if (chunks.length > 0 && title) {
      chunks[0] = `${title}. ${chunks[0]}`;
    }
    
    return chunks;
  }

  private createChunksFromParagraphs(paragraphs: string[]): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    let currentTopicWords = new Set<string>();
    const MAX_CHUNK_SIZE = 500;
    
    paragraphs.forEach(paragraph => {
      // Skip very short paragraphs
      if (paragraph.length < 20) return;
      
      // Extract topic words
      const topicWords = this.extractTopicWords(paragraph);
      
      // Check if this paragraph belongs with current chunk
      const belongsWithCurrent = this.paragraphBelongsWithChunk(
        paragraph, currentTopicWords, currentChunk
      );
      const wouldMakeChunkTooLarge = (currentChunk.length + paragraph.length) > MAX_CHUNK_SIZE;
      
      if (currentChunk.length > 0 && (!belongsWithCurrent || wouldMakeChunkTooLarge)) {
        // Store current chunk and start a new one
        if (currentChunk.length > 50) {
          chunks.push(currentChunk);
        }
        currentChunk = paragraph;
        currentTopicWords = new Set(topicWords);
      } else {
        // Add to current chunk
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
        // Update topic words
        topicWords.forEach(word => currentTopicWords.add(word));
      }
    });
    
    // Add the last chunk if it exists
    if (currentChunk.length > 50) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  private createChunksFromSentences(content: string): string[] {
    let chunks: string[] = [];
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    
    if (sentences.length > 0) {
      // Group sentences into meaningful chunks
      let currentChunk = "";
      let currentLength = 0;
      
      sentences.forEach(sentence => {
        const trimmedSentence = sentence.trim();
        if (trimmedSentence.length < 10) return; // Skip very short sentences
        
        const sentenceLength = trimmedSentence.split(/\s+/).length;
        
        // If adding this sentence would make chunk too big, start a new chunk
        if (currentLength > 0 && currentLength + sentenceLength > 200) {
          if (currentChunk.length > 50) {
            chunks.push(currentChunk);
          }
          currentChunk = trimmedSentence;
          currentLength = sentenceLength;
        } else {
          // Add to current chunk
          currentChunk += (currentChunk ? " " : "") + trimmedSentence;
          currentLength += sentenceLength;
        }
      });
      
      // Add the last chunk if it exists
      if (currentChunk.length > 50) {
        chunks.push(currentChunk);
      }
    } else {
      // Fallback methods if sentence splitting fails
      chunks = this.createFallbackChunks(content);
    }
    
    return chunks;
  }

  private createFallbackChunks(content: string): string[] {
    // Try paragraph-based splitting first
    let chunks = content.split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 50);
    
    // If that doesn't work, use word-based chunking
    if (chunks.length <= 1 && content.length > 500) {
      chunks = [];
      const words = content.split(/\s+/);
      for (let i = 0; i < words.length; i += 200) {
        const chunk = words.slice(i, i + 200).join(' ');
        if (chunk.length > 50) {
          chunks.push(chunk);
        }
      }
    }
    
    return chunks;
  }

  private extractTopicWords(text: string): string[] {
    const cleanedText = this.cleanText(text);
    const words = cleanedText.split(/\s+/);
    
    // Filter out stop words and short words
    const significantWords = words.filter(word => 
      word.length > 3 && !this.stopWords.has(word)
    );
    
    // Count word frequencies
    const wordCounts: Record<string, number> = {};
    significantWords.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    // Return top words by frequency
    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(entry => entry[0]);
  }

  private paragraphBelongsWithChunk(paragraph: string, currentTopicWords: Set<string>, currentChunk: string): boolean {
    if (currentChunk.length === 0) return true;
    
    // Check if paragraph continues a sentence from current chunk
    if (currentChunk.endsWith('-') || 
        currentChunk.endsWith(',') || 
        !currentChunk.match(/[.!?]$/)) {
      return true;
    }
    
    // Check for topic continuity using word overlap
    const paragraphTopicWords = this.extractTopicWords(paragraph);
    let sharedTopics = 0;
    
    paragraphTopicWords.forEach(word => {
      if (currentTopicWords.has(word)) sharedTopics++;
    });
    
    // Calculate similarity based on shared topics
    const similarityThreshold = 0.25;
    const similarity = sharedTopics / Math.max(paragraphTopicWords.length, 1);
    
    return similarity >= similarityThreshold;
  }

  // SECTION 5: QUERY AND RETRIEVAL

  public async queryRelevantContent(queryText: string, limit = 5): Promise<Array<{
    content: string;
    metadata: {
      url: string, 
      title: string,
      source?: string 
    };
    score: number;
  }>> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) return [];
    }
   
    try {
      if (this.documents.length === 0) return [];
      
      // Extract key terms and create query embedding
      const queryKeyTerms = this.extractQueryKeyTerms(queryText);
      const queryEmbedding = this.createEmbedding(queryText);
      
      // Score all documents
      const similarities = this.scoreDocuments(queryEmbedding, queryKeyTerms, queryText);
      
      // Filter, diversify and rank results
      return this.processQueryResults(similarities, limit);
    } catch (error) {
      console.error("[VectorStore] Error querying:", error);
      return [];
    }
  }

  private scoreDocuments(queryEmbedding: number[], queryTerms: string[], queryText: string): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string, timestamp?: number };
    score: number;
  }> {
    return this.documents.map(doc => {
      // Calculate vector similarity
      const rawScore = this.cosineSimilarity(queryEmbedding, doc.embedding);
      
      // Calculate term presence score
      const termPresenceScore = this.calculateTermPresenceScore(doc.content, queryTerms);
      
      // Extract timestamp and calculate recency boost
      const timestamp = VectorStore.extractTimestamp(doc.content, doc.metadata.url);
      const recencyBoost = VectorStore.calculateRecencyBoost(queryText, timestamp);
      
      // Start with base score
      let combinedScore = rawScore * (1.0 + termPresenceScore);
      
      // Apply recency boost
      combinedScore = combinedScore * recencyBoost;
      
      // Apply source-based boosting (with reduced weights)
      if (doc.metadata.url.includes('wikipedia.org')) {
        combinedScore = combinedScore * 1.2;
      } else if (doc.metadata.source === 'duckduckgo_news') {
        combinedScore = combinedScore * 1.1;
      }
      
      return {
        content: doc.content,
        metadata: {
          ...doc.metadata,
          timestamp 
        },
        score: combinedScore
      };
    }).sort((a, b) => b.score - a.score);
  }

  private processQueryResults(
    similarities: Array<{
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
    }>,
    limit: number
  ): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }> {
    // Apply quality floor
    const MIN_QUALITY_FLOOR = 0.05;
    const filteredResults = similarities.filter(item => item.score > MIN_QUALITY_FLOOR);
    
    // Get results by source type
    const wikiResults = filteredResults.filter(item => 
      item.metadata.url.includes('wikipedia.org')
    ).slice(0, 3);
    
    const newsResults = filteredResults.filter(item => 
      item.metadata.source === 'duckduckgo_news'
    ).slice(0, 3);
    
    const otherResults = filteredResults.filter(item => 
      !item.metadata.url.includes('wikipedia.org') && 
      item.metadata.source !== 'duckduckgo_news'
    ).slice(0, limit);
    
    // Combine results
    const combinedResults = [...wikiResults, ...newsResults, ...otherResults]
      .sort((a, b) => b.score - a.score);
    
    // Eliminate duplicates while preserving diversity
    return this.eliminateDuplicates(combinedResults, limit);
  }

  private eliminateDuplicates(
    results: Array<{
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
    }>,
    limit: number
  ): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }> {
    const uniqueResults: Array<{
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
    }> = [];
    
    const seenUrls = new Set<string>();
    
    // First pass: deduplicate by URL
    results.forEach(result => {
      if (!seenUrls.has(result.metadata.url)) {
        uniqueResults.push(result);
        seenUrls.add(result.metadata.url);
      } else if (uniqueResults.length < limit) {
        // Special handling for Wikipedia and News sources
        this.handleSpecialSourceDuplication(result, uniqueResults, seenUrls);
      }
    });
    
    // Ensure source diversity
    return this.ensureSourceDiversity(uniqueResults, results, limit);
  }

  private handleSpecialSourceDuplication(
    result: {
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
    },
    uniqueResults: Array<{
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
    }>,
    seenUrls: Set<string>
  ): void {
    const isSpecialSource = result.metadata.url.includes('wikipedia.org') || 
                           result.metadata.source === 'duckduckgo_news';
    
    if (isSpecialSource) {
      const existingChunk = uniqueResults.find(r => r.metadata.url === result.metadata.url);
      if (existingChunk) {
        // More permissive for special content - allow up to 70% overlap
        const contentOverlap = this.contentSimilarity(existingChunk.content, result.content);
        if (contentOverlap < 0.7) {
          uniqueResults.push(result);
        }
      }
    } else {
      // Standard case for regular content
      const existingChunk = uniqueResults.find(r => r.metadata.url === result.metadata.url);
      if (existingChunk) {
        const contentOverlap = this.contentSimilarity(existingChunk.content, result.content);
        if (contentOverlap < 0.5) {
          uniqueResults.push(result);
        }
      }
    }
  }

  private ensureSourceDiversity(
    uniqueResults: Array<{
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
    }>,
    allResults: Array<{
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
    }>,
    limit: number
  ): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }> {
    let finalResults = uniqueResults.slice(0, limit);
    
    // Extract source-specific results
    const wikiResults = allResults.filter(item => 
      item.metadata.url.includes('wikipedia.org')
    );
    
    const newsResults = allResults.filter(item => 
      item.metadata.source === 'duckduckgo_news'
    );
    
    // Ensure at least one Wikipedia result if available
    if (wikiResults.length > 0 && 
        !finalResults.some(r => r.metadata.url.includes('wikipedia.org'))) {
      if (finalResults.length >= limit) {
        finalResults.pop(); // Remove lowest scoring result
      }
      finalResults.push(wikiResults[0]);
      finalResults.sort((a, b) => b.score - a.score);
    }
    
    // Ensure at least one news result if available
    if (newsResults.length > 0 && 
        !finalResults.some(r => r.metadata.source === 'duckduckgo_news')) {
      if (finalResults.length >= limit) {
        finalResults.pop();
      }
      finalResults.push(newsResults[0]);
      finalResults.sort((a, b) => b.score - a.score);
    }
    
    return finalResults.slice(0, limit);
  }
}