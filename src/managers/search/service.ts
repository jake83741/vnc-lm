import puppeteer from 'puppeteer';
import axios from 'axios';
import { VectorStore } from './vectorstore';

// Constants - moved to top for easy access and modification
const STOP_WORDS = new Set([
  // Original stop words
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 
  'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 
  'both', 'but', 'by', 'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 
  'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 
  'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 
  'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 
  'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 
  'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 
  'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 
  'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 
  'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 
  'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 
  'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 
  'yourselves',
  
  // Additional common prepositions
  'aboard', 'about', 'across', 'ahead', 'along', 'alongside', 'amid', 'amidst', 'among', 'amongst', 
  'around', 'aside', 'astride', 'athwart', 'atop', 'barring', 'behind', 'beside', 'besides', 
  'beyond', 'concerning', 'considering', 'despite', 'except', 'excepting', 'excluding', 'following',
  'inside', 'like', 'minus', 'near', 'nearby', 'notwithstanding', 'opposite', 'outside', 'past', 
  'plus', 'regarding', 'round', 'save', 'since', 'throughout', 'toward', 'towards', 'underneath', 
  'unlike', 'upon', 'versus', 'via', 'within', 'without',
  
  // Additional determiners
  'another', 'any', 'certain', 'either', 'enough', 'every', 'various', 'whatever', 'whichever',
  'whose', 'wherein', 'whereby', 'whereupon', 'wherever', 'whichever', 'whomever',
  
  // Conjunctions
  'accordingly', 'albeit', 'although', 'furthermore', 'hence', 'however', 'instead', 'likewise',
  'meanwhile', 'moreover', 'nevertheless', 'nonetheless', 'otherwise', 'provided', 'similarly',
  'still', 'therefore', 'thus', 'whereas', 'wherefore', 'yet',
  
  // Numbers and time-related words
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'hundred', 'thousand', 'million', 'billion', 'today', 'tomorrow', 'yesterday', 'now', 'then',
  'always', 'never', 'often', 'sometimes', 'usually', 'rarely', 'seldom', 'frequently',
  'occasionally', 'eventually', 'finally', 'suddenly', 'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  
  // Common adverbs
  'actually', 'almost', 'already', 'also', 'altogether', 'anywhere', 'apparently', 'approximately',
  'certainly', 'clearly', 'completely', 'consequently', 'definitely', 'doubtfully', 'easily',
  'effectively', 'entirely', 'especially', 'essentially', 'exactly', 'explicitly', 'extremely', 
  'fairly', 'far', 'fortunately', 'frankly', 'frequently', 'generally', 'gradually', 'greatly',
  'hardly', 'heartily', 'hopefully', 'immediately', 'implicitly', 'indeed', 'indirectly',
  'inevitably', 'instantly', 'just', 'largely', 'literally', 'mainly', 'maybe', 'merely',
  'naturally', 'nearly', 'necessarily', 'obviously', 'occasionally', 'particularly', 'partly',
  'perhaps', 'plainly', 'possibly', 'precisely', 'primarily', 'probably', 'promptly', 'purely',
  'quite', 'rather', 'readily', 'really', 'recently', 'relatively', 'roughly', 'seemingly',
  'significantly', 'simply', 'slightly', 'somewhat', 'soon', 'specifically', 'strongly', 
  'supposedly', 'surely', 'thereby', 'thoroughly', 'truly', 'typically', 'ultimately',
  'undoubtedly', 'unfortunately', 'unnecessarily', 'usually', 'virtually', 'wholly',
  
  // Additional miscellaneous common words
  'able', 'anyone', 'anything', 'anywhere', 'become', 'becomes', 'becoming', 'begin', 'begins',
  'beginning', 'better', 'best', 'bigger', 'biggest', 'came', 'come', 'comes', 'coming', 'done',
  'either', 'else', 'enough', 'even', 'ever', 'everywhere', 'everyone', 'everything', 'exactly',
  'example', 'except', 'fact', 'find', 'finds', 'finding', 'found', 'get', 'gets', 'getting',
  'give', 'gives', 'giving', 'go', 'goes', 'going', 'gone', 'got', 'gotten', 'happen', 'happens',
  'happening', 'happened', 'hello', 'hi', 'hey', 'indeed', 'keep', 'keeps', 'keeping', 'kept',
  'know', 'knows', 'knowing', 'knew', 'known', 'least', 'less', 'let', 'lets', 'letting', 'like',
  'likely', 'look', 'looks', 'looking', 'looked', 'make', 'makes', 'making', 'made', 'many', 'much',
  'must', 'need', 'needs', 'needing', 'needed', 'next', 'none', 'nothing', 'nowhere', 'now',
  'okay', 'ok', 'please', 'put', 'puts', 'putting', 'quite', 'rather', 'right', 'said', 'say',
  'says', 'saying', 'see', 'sees', 'seeing', 'seen', 'saw', 'seem', 'seems', 'seeming', 'seemed',
  'shall', 'sure', 'take', 'takes', 'taking', 'taken', 'took', 'thank', 'thanks', 'thanking',
  'thanked', 'thing', 'things', 'think', 'thinks', 'thinking', 'thought', 'use', 'uses', 'using',
  'used', 'want', 'wants', 'wanting', 'wanted', 'well', 'went', 'whether', 'yes'
]);

const QUESTION_VERBS = new Set([
  // Original verbs
  'did', 'does', 'do', 'was', 'is', 'are', 'will', 'would', 'could', 'should', 'might', 'may', 'has', 'have', 'had',
  'am', 'be', 'been', 'being', 'can', 'dare', 'must', 'need', 'ought', 'shall', 'used',
  
  // Additional forms and contractions
  'ain\'t', 'aren\'t', 'can\'t', 'cannot', 'couldn\'t', 'daren\'t', 'didn\'t', 'doesn\'t', 'don\'t',
  'hadn\'t', 'hasn\'t', 'haven\'t', 'isn\'t', 'mightn\'t', 'mustn\'t', 'needn\'t', 'oughtn\'t',
  'shan\'t', 'shouldn\'t', 'wasn\'t', 'weren\'t', 'won\'t', 'wouldn\'t',
  
  // Additional tenses and forms
  'appear', 'appears', 'appeared', 'appearing',
  'become', 'becomes', 'became', 'becoming',
  'begin', 'begins', 'began', 'begun', 'beginning',
  'continue', 'continues', 'continued', 'continuing',
  'get', 'gets', 'got', 'gotten', 'getting',
  'going', 'goes', 'went', 'gone',
  'happen', 'happens', 'happened', 'happening',
  'keep', 'keeps', 'kept', 'keeping',
  'remain', 'remains', 'remained', 'remaining',
  'seem', 'seems', 'seemed', 'seeming',
  'start', 'starts', 'started', 'starting',
  
  // Subjunctive and conditional forms
  'were', 'would have', 'could have', 'should have', 'might have', 'must have',
  
  // Question-initiating words (often paired with auxiliary verbs)
  'why', 'how', 'when', 'where', 'what', 'which', 'who', 'whom', 'whose',
  
  // Phrasal verb components
  'come', 'comes', 'came', 'coming',
  'look', 'looks', 'looked', 'looking',
  'make', 'makes', 'made', 'making',
  'put', 'puts', 'putting',
  'take', 'takes', 'took', 'taken', 'taking',
  'turn', 'turns', 'turned', 'turning',
  
  // Additional modal-like expressions
  'able to', 'going to', 'got to', 'gotta', 'hafta', 'have to', 'has to', 'had to',
  'supposed to', 'want to', 'wanna', 'needs to', 'needed to',
  
  // Interrogative phrases
  'isn\'t it', 'aren\'t they', 'don\'t you', 'didn\'t they', 'wouldn\'t it',
  'could you', 'would you', 'will you', 'can you', 'do you', 'have you',
  'are you', 'is there', 'are there'
]);

declare global {
  interface Window {
    Readability: any;
  }
}

interface ScrapedDocument {
  url: string;
  title: string;
  content: string;
  source?: string;
}

export class SearchService {
  // SECTION 1: MAIN SEARCH FUNCTION
  static async getRelevantContentWithVectorSearch(query: string): Promise<string | null> {
    let browser = null;
    const vectorStore = VectorStore.getInstance();
    let initialized = false;
    
    try {
      // Launch browser once for all operations
      browser = await this.launchBrowser();
      
      // Collect documents from various sources
      const documents = await this.collectDocuments(query, browser);
      
      if (documents.length === 0) return null;
      
      // Filter documents by relevance
      const filteredDocuments = this.filterDocumentsByRelevance(query, documents);
      
      // Initialize vector store and add documents
      initialized = await vectorStore.initialize();
      if (!initialized || !(await vectorStore.addDocuments(filteredDocuments))) return null;
      
      // Get statistics for logging
      const totalSourceCharacters = documents.reduce((total, doc) => total + doc.content.length, 0);
      
      // Get relevant chunks using combined vector and keyword approaches
      let relevantChunks = await this.getRelevantChunks(query, documents, vectorStore);
      
      // Apply compression to reduce token usage
      relevantChunks = this.applyTwoPassCompression(query, relevantChunks);
      
      if (relevantChunks.length === 0) return null;
      
      // Format the context for output
      const formattedContext = this.formatContext(relevantChunks, totalSourceCharacters);
      
      return formattedContext;
    } catch (error) {
      console.error('Error in vector search:', error);
      return null;
    } finally {
      if (browser) await browser.close().catch((err: any) => console.error('Error closing browser:', err));
      if (initialized) await vectorStore.close();
      VectorStore.instance = null;
    }
  }

  // SECTION 2: DOCUMENT COLLECTION FUNCTIONS
  private static async collectDocuments(query: string, browser: any): Promise<ScrapedDocument[]> {
    // Get Wikipedia URLs and content
    const wikiUrls = await this.getTopWikipediaUrls(query, 2);
    const wikiDocuments: ScrapedDocument[] = [];
    
    for (const url of wikiUrls) {
      try {
        const doc = await this.extractWikipediaContent(url);
        if (doc) wikiDocuments.push(doc);
      } catch (error) {
        console.error(`Error processing Wikipedia URL: ${url}`, error);
      }
    }
    
    // Get regular DuckDuckGo results
    const rawDdgResults = await this.getDuckDuckGoResults(query, 15, browser);
    
    // Get DuckDuckGo NEWS results
    const rawDdgNewsResults = await this.getDuckDuckGoNewsResults(query, 10, browser);
    
    // Combine all documents
    return [...wikiDocuments, ...rawDdgNewsResults, ...rawDdgResults];
  }

  private static filterDocumentsByRelevance(query: string, documents: ScrapedDocument[]): ScrapedDocument[] {
    const RELEVANCE_THRESHOLD = 0.15;
    
    return documents.filter(doc => {
      const relevanceScore = this.checkRelevanceToQuery(query, doc.content);
      const isRelevant = relevanceScore >= RELEVANCE_THRESHOLD;
      
      // Always keep Wikipedia articles
      if (doc.url.includes('wikipedia.org')) return true;
      
      return isRelevant;
    });
  }

  // SECTION 3: RELEVANCE AND MATCHING FUNCTIONS
  private static async getRelevantChunks(query: string, documents: ScrapedDocument[], vectorStore: any): Promise<Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }>> {
    // Get keyword matches
    const keywordMatches = this.performKeywordMatch(query, documents);
    const topKeywordMatches = keywordMatches.slice(0, 3);
    
    // Get vector search results
    let relevantChunks = await vectorStore.queryRelevantContent(query, 5);
    
    // Combine results and remove duplicates
    const combinedChunks = [...relevantChunks];
    
    topKeywordMatches.forEach(match => {
      const isDuplicate = relevantChunks.some((chunk: { metadata: { url: string; }; content: string; }) => 
        chunk.metadata.url === match.metadata.url && 
        this.contentSimilarity(chunk.content, match.content) > 0.3
      );
      
      if (!isDuplicate) {
        combinedChunks.push({
          ...match,
          score: match.score * 0.5
        });
      }
    });
    
    // Boost specific source types
    const wikiChunks = combinedChunks.filter(chunk => chunk.metadata.url.includes('wikipedia.org'));
    
    const scoredChunks = combinedChunks.map(chunk => {
      if (chunk.metadata.url.includes('wikipedia.org')) {
        return { ...chunk, score: chunk.score * 1.2 };
      }
      return chunk;
    }).sort((a, b) => b.score - a.score);
    
    // Ensure source diversity
    let finalChunks = [...scoredChunks];
    if (wikiChunks.length > 0 && !finalChunks.some(chunk => chunk.metadata.url.includes('wikipedia.org'))) {
      finalChunks = [...scoredChunks.slice(0, 4), wikiChunks[0]];
    }
    
    // Limit the number of chunks
    return finalChunks.slice(0, 5);
  }

  private static checkRelevanceToQuery(query: string, content: string): number {
    // Clean and normalize text
    const cleanQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ');
    const cleanContent = content.toLowerCase().replace(/[^\w\s]/g, ' ');
    
    // Extract key terms from query
    const queryTerms = cleanQuery.split(/\s+/)
      .filter(term => term.length > 3)
      .filter(term => !STOP_WORDS.has(term) && !QUESTION_VERBS.has(term));
          
    // Simple relevance score based on term frequency
    let matchCount = 0;
    let importantMatchCount = 0;
    
    queryTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'g');
      const matches = cleanContent.match(regex);
      if (matches) {
        matchCount += matches.length;
        importantMatchCount++; // Count unique terms that match
      }
    });
    
    // Calculate a normalized score
    const contentLength = cleanContent.split(/\s+/).length;
    const termDensity = contentLength > 0 ? matchCount / contentLength : 0;
    const termCoverage = queryTerms.length > 0 ? importantMatchCount / queryTerms.length : 0;
    
    // Combined score with emphasis on term coverage
    return (termDensity * 0.3) + (termCoverage * 0.7);
  }

  private static performKeywordMatch(query: string, documents: ScrapedDocument[]): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }> {
    const queryWords = query.toLowerCase().split(/\s+/);
    
    // Filter and add positional weighting to key terms
    const keyTerms: Array<{term: string, weight: number}> = [];
    const queryLength = queryWords.length;
    
    queryWords.forEach((word, index) => {
      if (word.length > 2 && !STOP_WORDS.has(word)) {
        // Calculate position weight: terms later in the query get higher weights
        const positionWeight = 1.0 + (index / queryLength);
        keyTerms.push({ term: word, weight: positionWeight });
      }
    });
    
    // Create regex patterns for key terms
    const regexPatterns = keyTerms.map(item => ({
      regex: new RegExp(`\\b${item.term}\\b`, 'i'),
      weight: item.weight
    }));
    
    const results: Array<{
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
    }> = [];
    
    // Process each document
    documents.forEach(doc => {
      // Split document content into paragraphs
      const paragraphs = doc.content.split(/\n{2,}/).filter(p => p.trim().length > 0);
      
      // If no clear paragraphs, use sentences
      let textBlocks = paragraphs.length > 1 ? paragraphs : 
        doc.content.match(/[^.!?]+[.!?]+/g) || [doc.content];
      
      textBlocks.forEach(block => {
        if (block.length < 50) return; // Skip very short blocks
        
        // Calculate keyword match score with position weights
        let matchScore = 0;
        let uniqueTermsMatched = 0;
        const matchedTerms = new Set<string>();
        
        regexPatterns.forEach((pattern, index) => {
          const matches = block.match(pattern.regex);
          if (matches && matches.length > 0) {
            // Apply position weight to the score
            const weightedScore = matches.length * pattern.weight * (1 + 0.1 * Math.min(matches.length, 5));
            matchScore += weightedScore;
            
            uniqueTermsMatched++;
            matchedTerms.add(keyTerms[index].term);
          }
        });
        
        // Boost if block contains multiple unique terms
        if (uniqueTermsMatched > 1) {
          matchScore *= (1 + 0.2 * uniqueTermsMatched);
        }
        
        // If this block has a good match score, add to results
        if (matchScore > 1) {
          results.push({
            content: block,
            metadata: {
              url: doc.url,
              title: doc.title,
              source: doc.source
            },
            score: matchScore
          });
        }
      });
    });
    
    // Sort by score (higher is better)
    return results.sort((a, b) => b.score - a.score);
  }

  private static contentSimilarity(text1: string, text2: string): number {
    // Clean and tokenize the texts
    const words1 = new Set(
      text1.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2)
    );
    
    const words2 = new Set(
      text2.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2)
    );
    
    let commonWords = 0;
    words1.forEach(word => {
      if (words2.has(word)) commonWords++;
    });
    
    const totalUniqueWords = words1.size + words2.size - commonWords;
    return totalUniqueWords > 0 ? commonWords / totalUniqueWords : 0;
  }

  // SECTION 4: DATA COMPRESSION FUNCTIONS
  private static applyTwoPassCompression(query: string, chunks: Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }>): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }> {
    if (chunks.length === 0) return [];
    
    // Extract query terms
    const queryTerms = this.extractQueryTerms(query);
    
    // PASS 1: Score chunks for answer likelihood
    const scoredChunks = this.scoreChunksForAnswerLikelihood(chunks, queryTerms);
    
    // PASS 2: Apply compression based on likelihood
    return this.applyCompressionByLikelihood(scoredChunks, queryTerms);
  }

  private static extractQueryTerms(query: string): string[] {
    return query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 3 && !STOP_WORDS.has(term));
  }

  private static scoreChunksForAnswerLikelihood(chunks: Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }>, queryTerms: string[]): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
    answerLikelihood: number;
  }> {
    return chunks.map(chunk => {
      let answerLikelihood = chunk.score; // Start with original relevance
      const content = chunk.content.toLowerCase();
      
      // Check for query terms
      for (const term of queryTerms) {
        if (content.includes(term)) {
          answerLikelihood += 0.2; // Boost for each query term
        }
      }
      
      // Check for numbers (useful for many factual questions)
      const hasNumbers = /\b\d+[,\.]?\d*\b/.test(content);
      if (hasNumbers) {
        answerLikelihood += 0.3; 
      }
      
      // Check for answer-suggesting phrases
      const answerPatterns = [
        'is', 'was', 'are', 'were', 'has', 'had', 'used', 
        'contains', 'consists', 'includes', 'totals'
      ];
      
      for (const pattern of answerPatterns) {
        if (content.includes(pattern)) {
          answerLikelihood += 0.1;
        }
      }
      
      return {
        ...chunk,
        answerLikelihood
      };
    }).sort((a, b) => b.answerLikelihood - a.answerLikelihood);
  }

  private static applyCompressionByLikelihood(
    scoredChunks: Array<{
      content: string;
      metadata: { url: string, title: string, source?: string };
      score: number;
      answerLikelihood: number;
    }>, 
    queryTerms: string[]
  ): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }> {
    // Determine threshold for likely answer chunks
    const answerThreshold = Math.max(1, Math.floor(scoredChunks.length * 0.4));
    
    return scoredChunks.map((chunk, index) => {
      const isLikelyAnswerChunk = index < answerThreshold;
      const compressedContent = isLikelyAnswerChunk
        ? this.applyLightCompression(chunk.content, queryTerms)
        : this.applyHeavyCompression(chunk.content, queryTerms);
      
      return {
        content: compressedContent,
        metadata: chunk.metadata,
        score: chunk.score
      };
    });
  }

  private static applyLightCompression(content: string, queryTerms: string[]): string {
    // Split into sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    if (sentences.length <= 3) return content; // If 3 or fewer sentences, keep all
    
    // Find sentences likely to contain answers
    const answerSentenceIndices = this.findAnswerSentences(sentences, queryTerms);
    
    // If no answer sentences found, fall back to keeping first 2 sentences
    if (answerSentenceIndices.length === 0) {
      return sentences.slice(0, 2).join(' ');
    }
    
    // Create the context window (1 before, answer sentence, 1 after)
    return this.createContextWindow(sentences, answerSentenceIndices);
  }

  private static applyHeavyCompression(content: string, queryTerms: string[]): string {
    // Split into sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    if (sentences.length <= 1) return content;
    
    // Find sentences using stricter criteria
    const answerSentenceIndices = this.findAnswerSentences(sentences, queryTerms, true);
    
    // If no answer sentences found, just return the highest scoring sentence
    if (answerSentenceIndices.length === 0) {
      return this.findBestSentence(sentences, queryTerms);
    }
    
    // For peripheral chunks, only keep the answer sentences without context
    const keptSentences: string[] = [];
    sentences.forEach((sentence, index) => {
      if (answerSentenceIndices.includes(index)) {
        keptSentences.push(sentence);
      }
    });
    
    return keptSentences.join(' ').trim();
  }

  private static findAnswerSentences(sentences: string[], queryTerms: string[], strict = false): number[] {
    const indices: number[] = [];
    
    sentences.forEach((sentence, index) => {
      const lowerSentence = sentence.toLowerCase();
      
      // Count query terms
      let queryTermCount = 0;
      for (const term of queryTerms) {
        if (lowerSentence.includes(term)) {
          queryTermCount++;
        }
      }
      
      // Check for numbers
      const hasNumbers = /\b\d+[,\.]?\d*\b/.test(lowerSentence);
      
      // Determine if this is an answer sentence
      let isAnswerSentence = false;
      
      if (strict) {
        // Stricter criteria for peripheral content
        if (queryTermCount >= 2 && hasNumbers) {
          isAnswerSentence = true;
        }
      } else {
        // Normal criteria
        if ((queryTermCount >= 1 && hasNumbers) || 
            (queryTermCount > 1 && lowerSentence.length < 200)) {
          isAnswerSentence = true;
        }
      }
      
      if (isAnswerSentence) {
        indices.push(index);
      }
    });
    
    return indices;
  }

  private static findBestSentence(sentences: string[], queryTerms: string[]): string {
    let bestIndex = 0;
    let bestScore = -1;
    
    sentences.forEach((sentence, index) => {
      const lowerSentence = sentence.toLowerCase();
      let score = 0;
      
      for (const term of queryTerms) {
        if (lowerSentence.includes(term)) {
          score++;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    
    return sentences[bestIndex];
  }

  private static createContextWindow(sentences: string[], answerIndices: number[]): string {
    const sentencesToKeep = new Set<number>();
    
    answerIndices.forEach(index => {
      // Add the answer sentence
      sentencesToKeep.add(index);
      
      // Add one sentence before if available
      if (index > 0) {
        sentencesToKeep.add(index - 1);
      }
      
      // Add one sentence after if available
      if (index < sentences.length - 1) {
        sentencesToKeep.add(index + 1);
      }
    });
    
    // Collect sentences in original order
    const keptSentences: string[] = [];
    sentences.forEach((sentence, index) => {
      if (sentencesToKeep.has(index)) {
        keptSentences.push(sentence);
      }
    });
    
    return keptSentences.join(' ').trim();
  }

  // SECTION 5: SOURCE FORMATTING FUNCTIONS
  private static formatContext(chunks: Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }>, totalSourceCharacters: number): string {
    if (chunks.length === 0) return '';
    
    // Group by document to avoid repetition
    interface GroupedContent {
      [key: string]: string[];
    }
    
    const groupedByDoc: GroupedContent = chunks.reduce((acc: GroupedContent, chunk) => {
      const key = `${chunk.metadata.url}|${chunk.metadata.title}`;
      if (!acc[key]) acc[key] = [];
      
      const sentences = this.extractCompleteSentences(chunk.content);
      acc[key].push(sentences);
      return acc;
    }, {});
    
    // Format with simplified headers
    let formattedContext = "";
    let sourceCounter = 1;
    
    Object.entries(groupedByDoc).forEach(([key, contents]) => {
      // Add source numbering with minimal formatting
      formattedContext += `Source ${sourceCounter} \n\n`;
      formattedContext += contents.join(' ') + '\n\n';
      formattedContext += `---\n\n`;
      sourceCounter++;
    });
    
    // Trim if too large
    const MAX_CONTEXT_LENGTH = 4000;
    if (formattedContext.length > MAX_CONTEXT_LENGTH) {
      formattedContext = this.trimToSentenceBoundary(formattedContext, MAX_CONTEXT_LENGTH) + "...(truncated)";
    }
    
    return formattedContext.trim();
  }

  private static extractCompleteSentences(text: string): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.length > 0 ? sentences.slice(0, 5).join(' ').trim() : text;
  }

  private static trimToSentenceBoundary(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    
    const lastBoundary = Math.max(
      text.lastIndexOf('.', maxLength),
      text.lastIndexOf('!', maxLength),
      text.lastIndexOf('?', maxLength)
    );
    
    return lastBoundary > 0 ? text.substring(0, lastBoundary + 1) : text.substring(0, maxLength);
  }

  // SECTION 6: DATA SOURCE FUNCTIONS
  private static async launchBrowser() {
    return puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });
  }

  static async getTopWikipediaUrls(query: string, limit = 3): Promise<string[]> {
    try {
      // Extract phrases and key terms
      const terms = this.extractKeyTerms(query);
      
      // Start with an empty array of URLs
      let urls: string[] = [];
      
      // First try searching with phrases (if any)
      const phrases = terms.filter(term => term.includes(' '));
      for (const phrase of phrases) {
        if (urls.length >= limit) break;
        const phraseResults = await this.searchWikipedia(phrase, 2);
        
        // Add results that aren't already in our list
        for (const url of phraseResults) {
          if (!urls.includes(url)) {
            urls.push(url);
            if (urls.length >= limit) break;
          }
        }
      }
      
      // Then fall back to individual terms if needed
      const individualTerms = terms.filter(term => !term.includes(' '));
      for (const term of individualTerms) {
        if (urls.length >= limit) break;
        const termResults = await this.searchWikipedia(term, 1);
        
        // Add results that aren't already in our list
        for (const url of termResults) {
          if (!urls.includes(url)) {
            urls.push(url);
            if (urls.length >= limit) break;
          }
        }
      }
      
      // Only fall back to the full query if we didn't get enough results
      if (urls.length < limit) {
        const fullQueryResults = await this.searchWikipedia(query, limit - urls.length);
        
        // Add results that aren't already in our list
        for (const url of fullQueryResults) {
          if (!urls.includes(url)) {
            urls.push(url);
            if (urls.length >= limit) break;
          }
        }
      }
      
      return urls;
    } catch (error) {
      console.error('Error in Wikipedia search:', error);
      return [];
    }
  }

  static extractKeyTerms(query: string): string[] {
    // First attempt to extract noun phrases
    const nounPhrases: string[] = [];
    const words = query.toLowerCase().split(/\s+/);
    
    // Look for 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      const word1 = words[i];
      const word2 = words[i + 1];
      
      // Skip if either word is a stopword, question verb, or too short
      if (STOP_WORDS.has(word1) || STOP_WORDS.has(word2) || 
          QUESTION_VERBS.has(word1) || QUESTION_VERBS.has(word2) ||
          word1.length <= 2 || word2.length <= 2) {
        continue;
      }
      
      nounPhrases.push(`${word1} ${word2}`);
    }
    
    // Look for 3-word phrases
    for (let i = 0; i < words.length - 2; i++) {
      const word1 = words[i];
      const word2 = words[i + 1];
      const word3 = words[i + 2];
      
      // Skip if words are stopwords (allowing for "X of Y" phrases)
      if ((STOP_WORDS.has(word1) && word1 !== 'of') || 
          (STOP_WORDS.has(word3) && word3 !== 'of') ||
          QUESTION_VERBS.has(word1) || QUESTION_VERBS.has(word3) ||
          word1.length <= 2 || word3.length <= 2) {
        continue;
      }
      
      nounPhrases.push(`${word1} ${word2} ${word3}`);
    }
    
    // Get individual terms for fallback
    const individualTerms = words
      .filter(term => term.length > 2)
      .filter(term => !STOP_WORDS.has(term) && !QUESTION_VERBS.has(term))
      .filter((term, index, self) => self.indexOf(term) === index);
    
    // Combine phrases and individual terms, prioritizing phrases
    return [...nounPhrases, ...individualTerms];
  }

  static async searchWikipedia(term: string, limit: number): Promise<string[]> {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&origin=*`;
    
    try {
      const { data } = await axios.get(searchUrl);
      
      if (!data.query?.search?.length) {
        return [];
      }
      
      return data.query.search
        .slice(0, limit)
        .map((result: { title: string }) => {
          return `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`;
        });
    } catch (error) {
      console.error(`Wikipedia search error for "${term}":`, error);
      return [];
    }
  }

  static async extractWikipediaContent(url: string): Promise<ScrapedDocument | null> {
    try {
      // Extract the page title from URL
      const titleMatch = url.match(/\/wiki\/(.+)$/);
      if (!titleMatch) return null;
      
      const pageTitle = decodeURIComponent(titleMatch[1].replace(/_/g, ' '));
      
      // Use API to get clean content
      const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${
        encodeURIComponent(pageTitle)}&format=json&origin=*`;
      
      const { data } = await axios.get(apiUrl);
      
      const pages = data.query.pages;
      const pageId = Object.keys(pages)[0];
      
      if (pageId === '-1' || !pages[pageId].extract || pages[pageId].extract.length < 50) return null;
      
      return {
        url,
        title: pages[pageId].title || pageTitle,
        content: this.cleanContent(pages[pageId].extract),
        source: 'wikipedia'
      };
    } catch (error) {
      console.error(`Error extracting Wikipedia content from ${url}:`, error);
      return null;
    }
  }

  static async getDuckDuckGoResults(query: string, limit = 20, browser?: any): Promise<ScrapedDocument[]> {
    return this.getDuckDuckGoGenericResults(query, limit, false, browser);
  }
  
  static async getDuckDuckGoNewsResults(query: string, limit = 10, browser?: any): Promise<ScrapedDocument[]> {
    return this.getDuckDuckGoGenericResults(query, limit, true, browser);
  }
  
  private static async getDuckDuckGoGenericResults(
    query: string, 
    limit: number, 
    isNews: boolean, 
    browser?: any
  ): Promise<ScrapedDocument[]> {
    let localBrowser = null;
    const needToCloseBrowser = !browser;
    
    try {
      // If no browser was provided, create a new one
      if (!browser) {
        localBrowser = await this.launchBrowser();
      }
      
      // Use the provided browser or the local one
      const activeBrowser = browser || localBrowser;
      
      // Use the appropriate search URL format
      const searchUrl = isNews 
        ? `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&iar=news`
        : `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      
      // Create a new page in the browser
      const page = await activeBrowser.newPage();
      
      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Extract search results
        const results = await page.evaluate(() => {
          const searchResults: Array<{title: string, url: string, description: string}> = [];
          const snippetCells = document.querySelectorAll('td.result-snippet');
          
          snippetCells.forEach((cell) => {
            const row = cell.closest('tr');
            if (!row) return;
            
            const prevRow = row.previousElementSibling;
            if (!prevRow) return;
            
            const titleCell = prevRow.querySelector('td a');
            if (!titleCell) return;
            
            const title = titleCell.textContent?.trim() || '';
            const url = titleCell.getAttribute('href') || '';
            const description = cell.textContent?.trim() || '';
            
            if (title && url) {
              searchResults.push({ title, url, description });
            }
          });
          
          return searchResults;
        });
        
        return results.slice(0, limit).map((result: { url: any; title: any; description: any; }) => ({
          url: result.url,
          title: result.title,
          content: `${result.title}\n\n${result.description}`,
          source: isNews ? 'duckduckgo_news' : 'duckduckgo'
        }));
      } finally {
        // Close the page but not the browser
        await page.close().catch((err: any) => console.error('Error closing page:', err));
      }
    } catch (error) {
      console.error(`Error in DuckDuckGo ${isNews ? 'News' : ''} search:`, error);
      return [];
    } finally {
      // Only close the browser if we created it locally
      if (needToCloseBrowser && localBrowser) {
        await localBrowser.close().catch((err: any) => console.error('Error closing browser:', err));
      }
    }
  }
 
  // SECTION 7: UTILITY FUNCTIONS
  private static cleanContent(content: string): string {
    return content
      .replace(/For customer support contact.*?com\./gs, '')
      .replace(/READ COMMENTS.*?DISCUSSION/g, '')
      .replace(/Stories Chosen For You/g, '')
      .replace(/ADVERTISEMENT/gi, '')
      .replace(/{[\s\S]*?}|<\/?[^>]+(>|$)|"@context"[\s\S]*?}/g, '') // Remove JSON blocks and HTML tags
      .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
      .replace(/\[\d+\]/g, '') // Remove reference numbers like [1], [2]
      .replace(/\n{3,}/g, '\n\n')  // Normalize excessive newlines
      .replace(/\s{2,}/g, ' ')     // Normalize multiple spaces
      .trim();
  }
 }