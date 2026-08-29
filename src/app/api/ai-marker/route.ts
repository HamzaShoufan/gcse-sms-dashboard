import { GoogleGenAI, Type, Schema } from '@google/genai';
import { NextResponse } from 'next/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const assessmentSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    marksAwarded: { type: Type.NUMBER, description: 'Marks awarded for the response' },
    maxMarks: { type: Type.NUMBER, description: 'Maximum possible marks for the question' },
    questionNumber: {
      type: Type.NUMBER,
      description: 'The question number or sequence number being assessed, starting at 1',
    },
    matchedKeywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Key points or criteria satisfied by the student',
    },
    missingKeywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Required criteria or keywords missed in the response',
    },
    detailedFeedback: { type: Type.STRING, description: 'Examiner commentary on handwriting and content' },
    improvementTip: { type: Type.STRING, description: 'Actionable tip for full marks next time' },
  },
  required: ['marksAwarded', 'maxMarks', 'questionNumber', 'matchedKeywords', 'missingKeywords', 'detailedFeedback', 'improvementTip'],
};

export async function POST(req: Request) {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'Missing GEMINI_API_KEY environment variable. Add it to your .env.local file.' },
        { status: 500 }
      );
    }

    const { questionImage, markSchemeImage, answerImage, maxMarks } = await req.json();

    if (!markSchemeImage || !answerImage) {
      return NextResponse.json(
        { error: 'Please upload both the mark scheme image and the answer image.' },
        { status: 400 }
      );
    }

    const formatImagePart = (base64Data: string) => {
      const match = base64Data.match(/^data:(image\/\w+);base64,(.*)$/);
      if (!match) return null;
      return {
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      };
    };

    const contents: any[] = [
      `You are a strict GCSE exam board marker.
      Analyze the provided images:
      1. Question Paper Image (if provided)
      2. Mark Scheme Image
      3. Student's Handwritten Answer Image

      Transcribe and evaluate the student's handwritten response against the official mark scheme criteria.
      Be strict with keywords, technical terms, and mark scheme requirements. Maximum available marks: ${maxMarks}.`
    ];

    if (questionImage) {
      const qPart = formatImagePart(questionImage);
      if (qPart) contents.push(qPart);
    }
    if (markSchemeImage) {
      const msPart = formatImagePart(markSchemeImage);
      if (msPart) contents.push(msPart);
    }
    if (answerImage) {
      const ansPart = formatImagePart(answerImage);
      if (ansPart) contents.push(ansPart);
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: assessmentSchema,
        temperature: 0.1,
      },
    });

    const assessment = JSON.parse(response.text || '{}');
    return NextResponse.json(assessment);
  } catch (error: any) {
    console.error('Gemini request failed:', error);
    const message = error?.message || 'Failed to process images with AI.';
    const status = error?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}