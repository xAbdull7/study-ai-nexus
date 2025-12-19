import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages, context, settings } = body; 

        const apiKey = process.env.GEMINI_API_KEY || "AIzaSyAI0ub29lSyVnwlkwWrqx9U8ImGeC6rHV8";

        if (!apiKey) return NextResponse.json({ error: "API Key is missing." }, { status: 401 });

        // Auto-Discovery
        let selectedModel = 'gemini-1.5-flash';
        try {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const listResp = await fetch(listUrl);
            const listData = await listResp.json();
            const validModel = listData.models?.find((m: any) => 
                m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent') &&
                (m.name.includes('flash') || m.name.includes('pro'))
            );
            if (validModel) selectedModel = validModel.name.replace('models/', '');
        } catch (e) {}

        const systemInstruction = `
            You are a dedicated AI Tutor for this specific lesson.
            
            SOURCE MATERIAL (CONTEXT):
            """
            ${context ? context.slice(0, 25000) : 'No specific context provided.'}
            """
            
            INSTRUCTIONS:
            1. Answer the user's questions **exclusively** based on the SOURCE MATERIAL provided above.
            2. If the answer is in the source material (even if it's a personal detail like "Does he have children?"), ANSWER IT directly.
            3. Do NOT act as a general assistant. Act as an expert on THIS specific content.
            4. Language: ${settings?.language || 'english'}
        `;

        const formattedHistory = messages.map((msg: any) => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const contents = [
            { role: 'user', parts: [{ text: systemInstruction }] },
            { role: 'model', parts: [{ text: "Understood. I will answer based strictly on the provided source material." }] },
            ...formattedHistory
        ];

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: contents })
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json({ error: data.error?.message || "Chat failed" }, { status: 500 });
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return NextResponse.json({ reply });

    } catch (error: any) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}