import { fileURLToPath } from "url";
import path from "path";
import chalk from "chalk";
import fs from "fs";
import fetch from "node-fetch";
import { getLlama, LlamaChatSession, resolveModelFile } from "node-llama-cpp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IA CONFIG
const modelsDirectory = path.join(__dirname, "..", "models");
const llama = await getLlama();

console.log(chalk.yellow("Resolving model file..."));
const modelPath = await resolveModelFile(
    "hf_bartowski_gemma-2-2b-it-Q6_K_L.gguf",
    modelsDirectory
);

console.log(chalk.yellow("Loading model..."));
const model = await llama.loadModel({ modelPath });
const context = await model.createContext();

const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
});

// Types for various data structures
interface PokemonData {
    id: number;
    name: string;
    flavor_text_entries: FlavorTextEntry[];
}

interface FlavorTextEntry {
    flavor_text: string;
    language: { name: string };
    version: { name: string };
}

interface TranslatedPokemon {
    pokedexId: number;
    name: string;
    description: string;
    descriptionTranslated: string;
    translatedTime: number;
}

function getPokemonDescription(pokemonData: PokemonData) {
    const sunOrMoonEntry = pokemonData.flavor_text_entries.find(
        (entry) =>
            entry.language.name === "en" &&
            (entry.version.name === "sun" || entry.version.name === "moon")
    );
    if (sunOrMoonEntry) return sunOrMoonEntry.flavor_text;

    const letsGoEntry = pokemonData.flavor_text_entries.find(
        (entry) =>
            entry.language.name === "en" &&
            (entry.version.name === "lets-go-eevee" ||
                entry.version.name === "lets-go-pikachu")
    );
    if (letsGoEntry) return letsGoEntry.flavor_text;

    const lastEntry = pokemonData.flavor_text_entries.find(
        (entry) => entry.language.name === "en"
    );
    return lastEntry ? lastEntry.flavor_text : "Descrição não encontrada";
}

async function fetchPokemonData(
    pokemonName: string | number
): Promise<TranslatedPokemon> {
    console.log(chalk.yellow("Creating context..."));

    try {
        console.log(`Buscando dados para ${pokemonName}...`);
        const response = await fetch(
            `https://pokeapi.co/api/v2/pokemon-species/${pokemonName
                .toString()
                .toLowerCase()}`
        );
        if (!response.ok)
            throw new Error(`Erro ao obter dados para ${pokemonName}`);

        const pokemonData = (await response.json()) as unknown as PokemonData;
        const description = getPokemonDescription(pokemonData);

        const q1 = `Traduza o seguinte texto do inglês para o português e forneça apenas a tradução: ${description}`;

        const startTime = Date.now();

        console.log(chalk.yellow("User: ") + q1);

        let translatedDescription = "";
        await session.prompt(q1, {
            onTextChunk(chunk) {
                process.stdout.write(chunk);
                translatedDescription += chunk;
            },
        });
        console.log(
            chalk.yellow("Descrição traduzida: ") + translatedDescription
        );

        const endTime = Date.now();
        const translatedTime = (endTime - startTime) / 1000;

        return {
            pokedexId: pokemonData.id,
            name: pokemonData.name,
            descriptionTranslated: translatedDescription,
            description,
            translatedTime,
        };
    } catch (error: any) {
        throw new Error(error.message);
    }
}

function saveToFile(fileName: string, data: any) {
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`Arquivo salvo em: ${filePath}`);
}

async function compareProcess() {
    const array = Array.from({ length: 12 }, (_, index) => index + 1);

    console.log(array);

    const startTime = Date.now();

    const resultsSequential = [];

    for (const item of array) {
        const data = await fetchPokemonData(item);
        console.log(data);
        resultsSequential.push(data);
    }

    const endTime = Date.now();

    const sequentialTime = (endTime - startTime) / 1000;

    saveToFile("pokedex.json", {
        resultsSequential,
        sequentialTime,
        maxTime: Math.max(
            ...resultsSequential.map((result) => result.translatedTime)
        ),
        minTime: Math.min(
            ...resultsSequential.map((result) => result.translatedTime)
        ),
        avgTime:
            resultsSequential.reduce(
                (acc, curr) => acc + curr.translatedTime,
                0
            ) / resultsSequential.length,
    });
}

compareProcess();
