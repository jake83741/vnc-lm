import puppeteer from 'puppeteer';
import axios from 'axios';
import { VectorStore } from './vectorstore';

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
  // Main method that combines all sources and returns relevant content
  static async getRelevantContentWithVectorSearch(query: string): Promise<string | null> {
    let browser = null;
    const vectorStore = VectorStore.getInstance();
    let initialized = false;
    
    try {
      // Launch a single browser instance for the entire process
      browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
      
      // Get Wikipedia URLs (no browser needed)
      const wikiUrls = await this.getTopWikipediaUrls(query, 3);
      
      // Extract content from Wikipedia URLs
      const wikiDocuments: ScrapedDocument[] = [];
      for (const url of wikiUrls) {
        try {
          const doc = await this.extractWikipediaContent(url);
          if (doc) {
            wikiDocuments.push(doc);
          }
        } catch (error) {
          console.error(`Error processing Wikipedia URL: ${url}`, error);
        }
      }
      
      // Get DuckDuckGo results using browser
      const ddgResults = await this.getDuckDuckGoResults(query, 20, browser);
      
      // Combine all documents - Wikipedia first
      const allDocuments = [...wikiDocuments, ...ddgResults];
      if (allDocuments.length === 0) return null;
      
      // Calculate total characters from all sources for percentage calculation
      const totalSourceCharacters = allDocuments.reduce((total, doc) => total + doc.content.length, 0);
      
      // Get keyword matches directly before vector search
      const keywordMatches = this.performKeywordMatch(query, allDocuments);
      const topKeywordMatches = keywordMatches.slice(0, 3);
      
      // Initialize vector store and add documents
      initialized = await vectorStore.initialize();
      if (!initialized || !(await vectorStore.addDocuments(allDocuments))) return null;
      
      // Query for relevant content
      let relevantChunks = await vectorStore.queryRelevantContent(query, 5);
      
      // Combine vector results with keyword matches
      const combinedChunks = [...relevantChunks];
      
      // Add keyword matches that aren't already in vector results
      topKeywordMatches.forEach(match => {
        // Check if this content or URL is already represented
        const isDuplicate = relevantChunks.some(chunk => 
          chunk.metadata.url === match.metadata.url && 
          this.contentSimilarity(chunk.content, match.content) > 0.3
        );
        
        if (!isDuplicate) {
          // Add to combined results, with score normalized to match vector scores
          combinedChunks.push({
            ...match,
            score: match.score * 0.5 // Adjust this multiplier based on testing
          });
        }
      });
      
      // Check if we have Wikipedia results in our combined results
      const wikiChunks = combinedChunks.filter(chunk => 
        chunk.metadata.url.includes('wikipedia.org')
      );
      
      // Boost Wikipedia scores
      let scoredChunks = combinedChunks.map(chunk => {
        if (chunk.metadata.url.includes('wikipedia.org')) {
          return { ...chunk, score: chunk.score * 1.2 };
        }
        return chunk;
      }).sort((a, b) => b.score - a.score);
      
      // Ensure at least one Wikipedia result if available
      let finalChunks = [...scoredChunks];
      if (wikiChunks.length > 0 && !finalChunks.some(chunk => 
        chunk.metadata.url.includes('wikipedia.org')
      )) {
        finalChunks = [...scoredChunks.slice(0, 4), wikiChunks[0]];
      }
      
      // Take top results after combining and sorting
      finalChunks = finalChunks.slice(0, 5);
      
      if (finalChunks.length === 0) return null;
      
      // Group by document to avoid repetition
      interface GroupedContent {
        [key: string]: string[];
      }
      
      const groupedByDoc: GroupedContent = finalChunks.reduce((acc: GroupedContent, chunk) => {
        const key = `${chunk.metadata.url}|${chunk.metadata.title}`;
        if (!acc[key]) acc[key] = [];
        
        const sentences = this.extractCompleteSentences(chunk.content);
        acc[key].push(sentences);
        return acc;
      }, {});
      
      // Format the final output
      let formattedContext = "";
      let sourceCounter = 1;
      let finalWikiCount = 0;
      let finalDdgCount = 0;
      
      Object.entries(groupedByDoc).forEach(([key, contents]) => {
        const parts = key.split('|');
        const url = parts[0];
        const title = parts[1];
        const isWiki = url.includes('wikipedia.org');
        
        formattedContext += `Source ${sourceCounter}: `;
        
        // Add source type indicator without duplication
        if (isWiki) {
          formattedContext += `Wikipedia ${title} `;
          finalWikiCount++;
        } else {
          formattedContext += `DuckDuckGo: ${title} `;
          finalDdgCount++;
        }
        
        formattedContext += contents.join(' ').replace(/\n+/g, ' ');
        formattedContext += ` ---`;
        
        sourceCounter++;
      });
      
      // Log final source distribution and percentage of content used
      // console.log(`(Final output sources: ${finalWikiCount} wikipedia.org, ${finalDdgCount} duckduckgo)`);
      
      const finalContentLength = formattedContext.length;
      const percentage = (finalContentLength / totalSourceCharacters * 100).toFixed(8);
      // console.log(`(Provided ${percentage}% of search context to the model.)`);
      
      // Trim if too large
      const MAX_CONTEXT_LENGTH = 4000;
      if (formattedContext.length > MAX_CONTEXT_LENGTH) {
        formattedContext = this.trimToSentenceBoundary(formattedContext, MAX_CONTEXT_LENGTH) + "...(truncated)";
      }
      
      return formattedContext.trim();
    } catch (error) {
      console.error('Error in vector search:', error);
      return null;
    } finally {
      if (browser) await browser.close().catch((err: any) => console.error('Error closing browser:', err));
      if (initialized) await vectorStore.close();
      VectorStore.instance = null;
    }
  }
  
  // Add this helper method for keyword matching
  private static performKeywordMatch(query: string, documents: ScrapedDocument[]): Array<{
    content: string;
    metadata: { url: string, title: string, source?: string };
    score: number;
  }> {
    // Extract key terms from the query (removing stop words)
    const stopWords = new Set(['is', 'the', 'a', 'an', 'of', 'to', 'in', 'for', 'on', 'with', 'by', 'about', 'as', 'at', 'be', 'or', 'and']);
    const keyTerms = query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
      
    // Create regex patterns for key terms
    const regexPatterns = keyTerms.map(term => new RegExp(`\\b${term}\\b`, 'i'));
    
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
        
        // Calculate keyword match score
        let matchScore = 0;
        let uniqueTermsMatched = 0;
        const matchedTerms = new Set<string>();
        
        regexPatterns.forEach((regex, index) => {
          const matches = block.match(regex);
          if (matches && matches.length > 0) {
            matchScore += matches.length * (1 + 0.1 * Math.min(matches.length, 5)); // Boost for multiple occurrences
            uniqueTermsMatched++;
            matchedTerms.add(keyTerms[index]);
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
  
  // Helper method for checking content similarity
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

  // Get Wikipedia articles related to a query
  static async getTopWikipediaUrls(query: string, limit = 3): Promise<string[]> {
    try {
      // Search Wikipedia API for relevant articles
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
      
      const { data } = await axios.get(searchUrl);
      
      if (!data.query?.search?.length) return [];
      
      // Extract page titles and create Wikipedia URLs
      return data.query.search
        .slice(0, limit)
        .map((result: { title: string }) => 
          `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`
        );
    } catch (error) {
      console.error('Error in Wikipedia search:', error);
      return [];
    }
  }
  
  // Extract Wikipedia content using the API
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

  // Get search results from DuckDuckGo using the shared browser
  static async getDuckDuckGoResults(query: string, limit = 20, browser?: any): Promise<ScrapedDocument[]> {
    let localBrowser = null;
    const needToCloseBrowser = !browser;
    
    try {
      // If no browser was provided, create a new one
      if (!browser) {
        localBrowser = await puppeteer.launch({
          headless: "new",
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
      }
      
      // Use the provided browser or the local one
      const activeBrowser = browser || localBrowser;
      
      const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      
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
          title: result.title,  // No prefix in the title field
          content: `${result.title}\n\n${result.description}`,
          source: 'duckduckgo'
        }));
      } finally {
        // Close the page but not the browser
        await page.close().catch((err: any) => console.error('Error closing page:', err));
      }
    } catch (error) {
      console.error('Error in DuckDuckGo search:', error);
      return [];
    } finally {
      // Only close the browser if we created it locally
      if (needToCloseBrowser && localBrowser) {
        await localBrowser.close().catch((err: any) => console.error('Error closing browser:', err));
      }
    }
  }
  
  // Clean up extracted content
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
  
  // Helper for extracting complete sentences
  private static extractCompleteSentences(text: string): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.length > 0 ? sentences.slice(0, 5).join(' ').trim() : text;
  }
  
  // Helper for trimming at sentence boundaries
  private static trimToSentenceBoundary(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    
    const lastBoundary = Math.max(
      text.lastIndexOf('.', maxLength),
      text.lastIndexOf('!', maxLength),
      text.lastIndexOf('?', maxLength)
    );
    
    return lastBoundary > 0 ? text.substring(0, lastBoundary + 1) : text.substring(0, maxLength);
  }
}