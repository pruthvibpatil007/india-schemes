import { GoogleGenAI, Type } from "https://esm.run/@google/genai";

const apiKey = prompt("Enter your Gemini API Key:") || "";
const ai = new GoogleGenAI({ apiKey: apiKey });

document.getElementById("schemeForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
        personal_info: {
            age: parseInt(document.getElementById("age").value),
            gender: document.getElementById("gender").value,
            state: document.getElementById("state").value,
            category: document.getElementById("category").value
        },
        socio_economic: {
            annual_income: parseFloat(document.getElementById("annual_income").value),
            occupation: document.getElementById("occupation").value
        }
    };

    document.getElementById("loading").classList.remove("hidden");
    document.getElementById("results").innerHTML = "";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Given the following citizen user profile payload, find matching Indian central and state government schemes. 
            User Profile: ${JSON.stringify(payload)}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        total_matched: { type: Type.INTEGER },
                        schemes: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    scheme_name: { type: Type.STRING },
                                    governing_body: { type: Type.STRING },
                                    scheme_type: { type: Type.STRING },
                                    brief_description: { type: Type.STRING },
                                    benefits_summary: { type: Type.STRING },
                                    documents_needed: {
                                        type: Type.ARRAY,
                                        items: { type: Type.STRING }
                                    },
                                    official_portal_url: { type: Type.STRING }
                                },
                                required: ["scheme_name", "governing_body", "brief_description", "benefits_summary", "documents_needed"]
                            }
                        }
                    },
                    required: ["total_matched", "schemes"]
                }
            }
        });

        const data = JSON.parse(response.text);
        renderSchemes(data.schemes);

    } catch (error) {
        console.error(error);
        alert("Error fetching schemes. Check console and API Key.");
    } finally {
        document.getElementById("loading").classList.add("hidden");
    }
});

function renderSchemes(schemes) {
    const container = document.getElementById("results");
    if (!schemes || schemes.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-center">No matching schemes found for this profile.</p>`;
        return;
    }

    container.innerHTML = `<h2 class="text-xl font-bold mb-4">Matched Schemes (${schemes.length})</h2>`;
    
    schemes.forEach(scheme => {
        const card = document.createElement("div");
        card.className = "border p-4 rounded-lg shadow-sm bg-gray-50 space-y-2";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <h3 class="font-bold text-lg text-blue-800">${scheme.scheme_name}</h3>
                <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-semibold">${scheme.scheme_type || 'Central/State'}</span>
            </div>
            <p class="text-xs text-gray-500 font-medium">Managed by: ${scheme.governing_body}</p>
            <p class="text-sm text-gray-700">${scheme.brief_description}</p>
            <div class="bg-green-50 p-2 rounded text-sm text-green-800"><strong>Benefits:</strong> ${scheme.benefits_summary}</div>
            <div>
                <strong class="text-xs text-gray-600 uppercase">Documents Needed:</strong>
                <ul class="list-disc list-inside text-sm text-gray-700 mt-1">
                    ${scheme.documents_needed.map(doc => `<li>${doc}</li>`).join('')}
                </ul>
            </div>
            ${scheme.official_portal_url ? `<a href="${scheme.official_portal_url}" target="_blank" class="inline-block text-sm text-blue-600 underline mt-2">Official Portal &rarr;</a>` : ''}
        `;
        container.appendChild(card);
    });
}
