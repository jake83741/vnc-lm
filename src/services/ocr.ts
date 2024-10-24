import { createWorker } from 'tesseract.js';

export async function performOCR(imageUrl: string): Promise<string | null> {
  try {
    // Create a Tesseract worker for English language
    const worker = await createWorker('eng');
    
    // Perform OCR on the image
    const { data: { text } } = await worker.recognize(imageUrl);
    
    // Terminate the worker to free up resources
    await worker.terminate();
    
    // Return the extracted text
    return text;
  } catch (error) {
    // Log any errors that occur during the OCR process
    console.error('Error performing OCR:', error);
    return null;
  }
}