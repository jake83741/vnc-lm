import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export async function scrapeWebsite(url: string): Promise<string> {
  try {
    // Fetch the HTML content of the webpage
    const response = await axios.get(url);
    
    // Create a DOM object from the HTML content
    const dom = new JSDOM(response.data, { url });
    
    // Initialize Readability with the DOM document
    const reader = new Readability(dom.window.document);
    // Parse the article content
    const article = reader.parse();

    if (article) {
      // Clean up the extracted text by removing extra whitespace
      let text = article.textContent.replace(/\s+/g, ' ').trim();
      return text;
    } else {
      return 'Failed to extract article content.';
    }
  } catch (error) {
    // Log any errors that occur during the scraping process
    console.error('Error scraping website:', error);
    return 'Failed to scrape website content.';
  }
}