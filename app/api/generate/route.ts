import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

/* -------------------------------------------------------------------------- */
/* CONFIG & HELPERS                                                           */
/* -------------------------------------------------------------------------- */
const MAX_RETRIES = 3;
const DELAY_MS = 2500;

// Helper: Parse PDF
const getPdfText = async (buffer: Buffer): Promise<string> => {
    try {
        const pdfModule = await import('pdf-parse');
        // @ts-ignore
        const parser = pdfModule.default || pdfModule;
        const data = await parser(buffer);
        return data.text;
    } catch (e) {
        console.error("❌ PDF Parse Failed:", e);
        return "";
    }
};

// Helper: Extract YouTube ID
const getYoutubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// Helper: Format Timestamps
const formatTimestamp = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `[${min}:${sec.toString().padStart(2, '0')}]`;
};

// Helper: Delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* MAIN HANDLER                                                               */
/* -------------------------------------------------------------------------- */

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, topic, fileData, mimeType, type, settings, nodeLabel, context, userAnswers } = body;

        // 1️⃣ API Key Validation
        const apiKey = process.env.GEMINI_API_KEY || "AIzaSyAI0ub29lSyVnwlkwWrqx9U8ImGeC6rHV8"; 
        
        if (!apiKey) return NextResponse.json({ error: "API Key missing." }, { status: 401 });

        // 2️⃣Auto-Discover Model 
        console.log("🔍 Auto-detecting model...");
        let selectedModel = 'gemini-1.5-flash';
        try {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const listResp = await fetch(listUrl);
            const listData = await listResp.json();
            
            const validModel = listData.models?.find((m: any) => 
                m.name.includes('gemini') && 
                m.supportedGenerationMethods?.includes('generateContent') &&
                (m.name.includes('flash') || m.name.includes('pro') || m.name.includes('1.5'))
            );
            if (validModel) selectedModel = validModel.name.replace('models/', '');
            console.log(`✅ Using Model: ${selectedModel}`);
        } catch (e) {
            console.warn("⚠️ Model discovery failed, using fallback.");
        }

        // 3️Prepare Prompts based on Action
        let promptParts: any[] = [];
        const lang = settings?.language || 'english';
        const difficulty = settings?.difficulty || 'Normal';

        //Expand Mind Map
        if (action === 'expand') {
            promptParts.push({ text: `
                You are a helper for a Mind Map tool.
                Task: Generate 3-5 sub-concepts related to the node "${nodeLabel}".
                Context: "${context ? context.slice(0, 3000) : topic}"
                Language: ${lang}
                Return ONLY raw JSON: { "newEdges": [{"source": "${nodeLabel}", "target": "SubConcept1"}, ...] }
            `});
        }
        // Generate Exam 
        else if (action === 'exam') {
            promptParts.push({ text: `
                Create a challenging exam.
                Context: "${context ? context.slice(0, 10000) : topic}"
                Language: ${lang}
                Difficulty: ${difficulty}
                Requirements: 3 MCQ, 2 Short Answer.
                Return ONLY raw JSON:
                { "exam": [ {"id": 1, "type": "mcq", "question": "...", "options": ["A","B"], "correct": "A"}, {"id": 2, "type": "text", "question": "..."} ] }
            `});
        }
        //  Grade Exam 
        else if (action === 'grade') {
            promptParts.push({ text: `
                Grade this student.
                Context: "${context ? context.slice(0, 5000) : ''}"
                Answers: ${JSON.stringify(userAnswers)}
                Return ONLY raw JSON:
                { "score": "85/100", "feedback": "...", "corrections": [{"questionId": 1, "status": "Correct", "remark": "..."}] }
            `});
        }
        // Main Generation 
        else {
            let contentText = "";
            if (type === 'youtube') {
                const videoId = getYoutubeVideoId(topic);
                if (!videoId) return NextResponse.json({ error: "Invalid YouTube Link" }, { status: 400 });
                try {
                    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
                    contentText = transcript.map(t => `${formatTimestamp(t.offset)} ${t.text}`).join(' ');
                } catch (e) { return NextResponse.json({ error: "No captions found." }, { status: 400 }); }
            }
            // Handle File
            else if (fileData) {
                const buffer = Buffer.from(fileData, 'base64');
                if (mimeType && mimeType.startsWith('image/')) {
                    promptParts.push({ inline_data: { mime_type: mimeType, data: fileData } });
                    promptParts.push({ text: "OCR Task: Extract educational content from this image." });
                } 
                // Handle PDF
                else {
                    contentText = await getPdfText(buffer);
                    if (!contentText) return NextResponse.json({ error: "Empty PDF." }, { status: 400 });
                }
            }
            // Handle Text
            else {
                contentText = topic || "";
            }

            if (contentText) promptParts.push({ text: contentText.slice(0, 40000) });

            // Main System Instruction
            promptParts.unshift({ text: `
                Act as an expert AI Tutor.
                Language: ${lang}
                Difficulty: ${difficulty}
                If timestamps exist, use them.
                Return ONLY raw JSON:
                {
                    "title": "String", "summary": "Markdown", "keyPoints": ["String"],
                    "quiz": [{"q": "String", "a": ["A","B"], "correct": "A"}],
                    "flashcards": [{"front": "String", "back": "String"}],
                    "mindMapEdges": [{"source": "String", "target": "String"}],
                    "stats": {"accuracy": "String", "timeSaved": "String"}
                }
            `});
        }

        // 4️⃣ Execute Request (Direct Fetch)
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

        for (let i = 1; i <= MAX_RETRIES; i++) {
            try {
                console.log(`🚀 Sending request (Attempt ${i})...`);
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: promptParts }] })
                });

                const data = await response.json();

                // Handle Google API Errors
                if (!response.ok) {
                    if (data.error?.code === 503) {
                        console.warn("⚠️ Server busy, retrying...");
                        await delay(DELAY_MS);
                        continue;
                    }
                    throw new Error(data.error?.message || "AI Error");
                }

                const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!aiText) throw new Error("Empty response");

                const cleanedText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
                return NextResponse.json(JSON.parse(cleanedText));

            } catch (err: any) {
                console.error(`Attempt ${i} Error:`, err.message);
                if (i === MAX_RETRIES) return NextResponse.json({ error: "AI Service Unavailable. Try again." }, { status: 503 });
            }
        }

    } catch (error: any) {
        console.error("❌ Global Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}