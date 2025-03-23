// src/managers/search/vectorstore.ts
export class VectorStore {
  public static instance: VectorStore | null = null;
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

  public static getInstance(): VectorStore {
    if (!VectorStore.instance) {
      VectorStore.instance = new VectorStore();
    }
    return VectorStore.instance;
  }

  public async initialize(): Promise<boolean> {
    try {
      // console.log("[VectorStore] Initializing simple in-memory vector store");
      this.documents = [];
      this.initialized = true;
      return true;
    } catch (error) {
      console.error("[VectorStore] Initialization failed:", error);
      return false;
    }
  }

  private cleanText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
  }

  private createEmbedding(text: string): number[] {
    const cleanedText = this.cleanText(text);
    const words = cleanedText.split(/\s+/);
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
    
    // Apply positional weighting
    const posWeightedFeatures = Object.fromEntries(
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
    
    // Get the top 128 most significant features
    const topFeatures = Object.entries(posWeightedFeatures)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 128)
      .map(entry => entry[0]);
    
    // Create the embedding vector
    const embedding = new Array(128).fill(0);
    const normalizer = words.length || 1;
    
    topFeatures.forEach((feature, index) => {
      embedding[index] = posWeightedFeatures[feature] / normalizer;
    });
    
    return embedding;
  }

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

  // Helper method to extract topic words from text
  private extractTopicWords(text: string): string[] {
    // Remove stop words and punctuation
    const cleanedText = this.cleanText(text);
    const words = cleanedText.split(/\s+/);
    
    // Filter out stop words and short words
    const significantWords = words.filter(word => 
      word.length > 3 && !this.stopWords.has(word)
    );
    
    // Count word frequencies to find key topics
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

  // Helper method to determine if a paragraph belongs with the current chunk
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
    const similarityThreshold = 0.25; // Lower threshold to keep more context together
    const similarity = sharedTopics / Math.max(paragraphTopicWords.length, 1);
    
    return similarity >= similarityThreshold;
  }

  public async addDocuments(documents: Array<{ url: string, title: string, content: string, source?: string }>): Promise<boolean> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) return false;
    }
  
    try {
      // console.log(`[VectorStore] Processing ${documents.length} documents for embedding`);
      
      let totalChunks = 0;
      
      documents.forEach((doc, docIndex) => {
        // console.log(`[VectorStore] Processing document: ${doc.title.substring(0, 30)}...`);
        
        // Split content into paragraphs first
        const paragraphs = doc.content
          .split(/\n{2,}/)
          .map(p => p.trim())
          .filter(p => p.length > 0);
        
        let chunks: string[] = [];
        
        // Process paragraphs to create semantically meaningful chunks
        if (paragraphs.length > 1) {
          let currentChunk = "";
          let currentTopicWords = new Set<string>();
          const MAX_CHUNK_SIZE = 500; // Characters, not words
          
          paragraphs.forEach(paragraph => {
            // Skip very short paragraphs that are likely headers or separators
            if (paragraph.length < 20) {
              return;
            }
            
            // Extract key topic words from paragraph
            const topicWords = this.extractTopicWords(paragraph);
            
            // Decide if this paragraph belongs with the current chunk
            const belongsWithCurrent = this.paragraphBelongsWithChunk(paragraph, currentTopicWords, currentChunk);
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
        } else {
          // Extract chunks using sentence boundaries where possible
          const sentences = doc.content.match(/[^.!?]+[.!?]+/g) || [];
          
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
            // Fallback to paragraph splitting if sentence splitting fails
            chunks = doc.content.split(/\n{2,}/)
              .map(p => p.trim())
              .filter(p => p.length > 50);
            
            // If still no good chunks, use word-based chunking
            if (chunks.length <= 1 && doc.content.length > 500) {
              chunks = [];
              const words = doc.content.split(/\s+/);
              for (let i = 0; i < words.length; i += 200) {
                const chunk = words.slice(i, i + 200).join(' ');
                if (chunk.length > 50) {
                  chunks.push(chunk);
                }
              }
            }
          }
        }
        
        // Add title information to the first chunk for better relevance
        if (chunks.length > 0 && doc.title) {
          chunks[0] = `${doc.title}. ${chunks[0]}`;
        }
        
        chunks.forEach((chunk, chunkIndex) => {
          const embedding = this.createEmbedding(chunk);
          
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
  
      // console.log(`[VectorStore] Added ${totalChunks} total chunks to in-memory store`);
      return true;
    } catch (error) {
      console.error("[VectorStore] Error adding documents:", error);
      return false;
    }
  }

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
      // console.log(`[VectorStore] Querying with text: "${queryText.substring(0, 50)}..."`);
      
      if (this.documents.length === 0) {
        // console.log("[VectorStore] No documents in store to query");
        return [];
      }
      
      // Extract key terms from the query for term matching
      const queryKeyTerms = this.extractQueryKeyTerms(queryText);
      
      // Create embedding for query
      const queryEmbedding = this.createEmbedding(queryText);
      
      // Find similarities
      const similarities = this.documents.map(doc => {
        // Calculate basic similarity using vector embeddings
        const rawScore = this.cosineSimilarity(queryEmbedding, doc.embedding);
        
        // Calculate term presence score - boost for chunks containing query terms
        const termPresenceScore = this.calculateTermPresenceScore(doc.content, queryKeyTerms);
        
        // Combined score: vector similarity with term presence boost
        let combinedScore = rawScore * (1.0 + termPresenceScore);
        
        // ADDED: Apply source-based boosting
        if (doc.metadata.url.includes('wikipedia.org')) {
          // Boost Wikipedia scores
          combinedScore = combinedScore * 1.5;
        }
        
        return {
          content: doc.content,
          metadata: doc.metadata,
          score: combinedScore
        };
      });
      
      // Sort by similarity (higher is better)
      const sorted = similarities.sort((a, b) => b.score - a.score);
      
      // Lower threshold for Wikipedia content to ensure inclusion
      const REGULAR_THRESHOLD = 0.275;
      const WIKI_THRESHOLD = 0.2; // Lower threshold for Wikipedia
      
      // Filter based on thresholds
      const filteredResults = sorted.filter(item => {
        if (item.metadata.url.includes('wikipedia.org')) {
          return item.score > WIKI_THRESHOLD;
        }
        return item.score > REGULAR_THRESHOLD;
      });
      
      // ADDED: Force Wikipedia inclusion - get top Wikipedia chunks
      const wikiResults = filteredResults.filter(item => 
        item.metadata.url.includes('wikipedia.org')
      ).slice(0, 3); // Take up to 3 Wikipedia results
      
      // Fill remaining spots with other results
      const otherResults = filteredResults
        .filter(item => !item.metadata.url.includes('wikipedia.org'))
        .slice(0, limit - wikiResults.length);
      
      // Combine and preserve relative ranking
      const combinedResults = [...wikiResults, ...otherResults];
      combinedResults.sort((a, b) => b.score - a.score);
      
      // Prevent duplicates
      const uniqueResults: Array<{
        content: string;
        metadata: { url: string, title: string, source?: string };
        score: number;
      }> = [];
      
      const seenUrls = new Set<string>();
      
      combinedResults.forEach(result => {
        // For each URL, only take the highest scoring chunk
        if (!seenUrls.has(result.metadata.url)) {
          uniqueResults.push(result);
          seenUrls.add(result.metadata.url);
        } else if (uniqueResults.length < limit) {
          // Special case for Wikipedia - allow more chunks with less strict similarity check
          if (result.metadata.url.includes('wikipedia.org')) {
            const existingChunk = uniqueResults.find(r => r.metadata.url === result.metadata.url);
            if (existingChunk) {
              // More permissive for Wikipedia content - allow up to 70% overlap
              const contentOverlap = this.contentSimilarity(existingChunk.content, result.content);
              if (contentOverlap < 0.7) {
                uniqueResults.push(result);
              }
            }
          } else {
            // Standard case for non-Wikipedia content
            const existingChunk = uniqueResults.find(r => r.metadata.url === result.metadata.url);
            if (existingChunk) {
              const contentOverlap = this.contentSimilarity(existingChunk.content, result.content);
              if (contentOverlap < 0.5) {
                uniqueResults.push(result);
              }
            }
          }
        }
      });
      
      // Return top results (up to limit)
      const finalResults = uniqueResults.slice(0, limit);
      
      // If we have Wikipedia results but none made it to the final set, replace lowest score
      if (wikiResults.length > 0 && 
        !finalResults.some(r => r.metadata.url.includes('wikipedia.org'))) {
        finalResults.pop(); // Remove lowest scoring result
        finalResults.push(wikiResults[0]); // Add top Wikipedia result
        finalResults.sort((a, b) => b.score - a.score); // Re-sort
      }
      
      // console.log(`[VectorStore] Returning ${finalResults.length} relevant chunks (${
      //  finalResults.filter(r => r.metadata.url.includes('wikipedia.org')).length
      // } from Wikipedia)`);
      
      return finalResults;
    } catch (error) {
      console.error("[VectorStore] Error querying:", error);
      return [];
    }
  }
  
  // Extract key terms from query for term matching
  private extractQueryKeyTerms(queryText: string): string[] {
    const cleaned = this.cleanText(queryText);
    const words = cleaned.split(/\s+/);
    
    // Filter out stop words and short words
    return words.filter(word => 
      word.length > 3 && !this.stopWords.has(word)
    );
  }
  
  // Calculate a score based on presence of query terms in content
  private calculateTermPresenceScore(content: string, queryTerms: string[]): number {
    if (queryTerms.length === 0) return 0;
    
    const cleanedContent = this.cleanText(content);
    let score = 0;
    let matchedTerms = 0;
    
    // Split content into sentences for sentence-level scoring
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    
    // Calculate term presence per sentence
    sentences.forEach(sentence => {
      const cleanedSentence = this.cleanText(sentence);
      let sentenceScore = 0;
      let sentenceMatches = 0;
      
      queryTerms.forEach(term => {
        // Check if sentence contains this query term
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        if (regex.test(cleanedSentence)) {
          sentenceMatches++;
          sentenceScore += 0.25; // Base score for containing term
        }
      });
      
      // Boosting for sentences with multiple query terms (higher density)
      if (sentenceMatches > 1) {
        sentenceScore *= 1.0 + (sentenceMatches / queryTerms.length);
      }
      
      score += sentenceScore;
      matchedTerms = Math.max(matchedTerms, sentenceMatches);
    });
    
    // Adjust final score based on portion of query terms matched and sentence count
    const termCoverageRatio = matchedTerms / queryTerms.length;
    return score * (0.5 + 0.5 * termCoverageRatio);
  }

  // Helper to check content overlap between chunks
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

  public async close(): Promise<void> {
    // console.log("[VectorStore] Closing in-memory vector store");
    this.documents = [];
    this.initialized = false;
  }
}