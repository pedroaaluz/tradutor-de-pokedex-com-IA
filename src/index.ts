import { fileURLToPath } from "url";
import path from "path";
import chalk from "chalk";
import fs from "fs";
import fetch from "node-fetch";
import { getLlama, LlamaChatSession, resolveModelFile } from "node-llama-cpp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelsDirectory = path.join(__dirname, "..", "models");
const llama = await getLlama();

console.log(chalk.yellow("Resolving model file..."));
const modelPath = await resolveModelFile(
    "hf_bartowski_gemma-2-2b-it-Q6_K_L.gguf",
    modelsDirectory
);
console.log(chalk.yellow("Loading model..."));
const model = await llama.loadModel({ modelPath });

console.log(chalk.yellow("Creating context..."));
const context = await model.createContext();
const session = new LlamaChatSession({
    contextSequence: context.getSequence()
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

interface ErrorInfo {
  pokemon: string;
  location: string;
  level: string;
  error: string;
  errorType: string;
}

interface LocationInfo {
  location?: string;
  level?: string;
  pokemonsInLocation: { biome: string; pokemon: string[] }[];
}

interface PokedexEntry {
  pokemon: string;
  biome: string;
  locations: {
    location: string;
    level: string;
  }[]
  description: string;
  pokedexId: number | string;
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

  async function fetchPokemonData(pokemonName: string): Promise<TranslatedPokemon | ErrorInfo> {
  
    try {
      console.log(`Buscando dados para ${pokemonName}...`);
      const response = await fetch(
        `https://pokeapi.co/api/v2/pokemon-species/${pokemonName.toLowerCase()}`
      );
      if (!response.ok)
        throw new Error(`Erro ao obter dados para ${pokemonName}`);
  
      const pokemonData = await response.json() as unknown as PokemonData;
      const description = getPokemonDescription(pokemonData);
  
      const q1 = `Traduza o seguinte texto do inglês para o português e forneça apenas a tradução: ${description}`;
  
      const startTime = Date.now(); 
  
      console.log(chalk.yellow("User: ") + q1);
  
      let translatedDescription = '';
      await session.prompt(q1, {
        onTextChunk(chunk) {
          process.stdout.write(chunk);
          translatedDescription += chunk;
        }
      });
      console.log(chalk.yellow("Descrição traduzida: ") + translatedDescription);
  
      const endTime = Date.now(); 
      const translatedTime = (endTime - startTime) / 1000; 
  
      return {
        pokedexId: pokemonData.id,
        name: pokemonData.name,
        descriptionTranslated: translatedDescription,
        description,
        translatedTime
      };
    } catch (error: any) {
      return {
        pokemon: pokemonName,
        location: "",
        level: "",
        error: error.message,
        errorType: "fetchError",
      };
    }
  }
  

async function processPokemonFile() {
  const filePath = path.join(__dirname, 'Localização_Pokémons.txt');
  const fileContent = fs.readFileSync(filePath, "utf8");
  const biomeTranslations: Record<string, string> = { wild: "selva" };
  const lines = fileContent.split("\n");

  const pokedex: PokedexEntry[] = [];
  const pokemonErrors: ErrorInfo[] = [];
  const pokemonLocations: LocationInfo[] = [];
  const processedPokemon: Record<string, number> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() || '';
    if (!line) continue;

    if (line.includes("=>")) {
      const [location, level] = line
        .replace(/(\r|\) =>)/g, "")
        .split(" (Nível: ")
        .map((part) => part.trim());
      pokemonLocations.push({ location, level, pokemonsInLocation: [] });
    } else {
      const [biome, pokemons] = line.split(": ").map((part) => part.trim());
      if (!pokemons) continue;

      const biomeName = biome ? (biomeTranslations[biome.toLowerCase()] || 'n encontrado') : 'n encontrado';
      const pokemonList = pokemons.split(",").map((name) => name.trim());

      for (const pokemonName of pokemonList) {
        const locationIndex = pokemonLocations.length - 1;

        if (processedPokemon[pokemonName]) {
          pokemonLocations[locationIndex]?.pokemonsInLocation.push({
            biome: biomeName,
            pokemon: pokemonList,
          });

          continue;
        }


        const pokedexIndex = processedPokemon[pokemonName]!;

        if (pokedex[pokedexIndex]) {
          pokedex[pokedexIndex].locations.push({
            location: pokemonLocations[locationIndex]?.location!,
            level: pokemonLocations[locationIndex]?.level!
          });

          continue
        } 

        const apiData = await fetchPokemonData(pokemonName);
        if ('error' in apiData) {
          pokemonErrors.push({
            pokemon: pokemonName,
            location: pokemonLocations[pokemonLocations.length - 1]?.location || '',
            level: pokemonLocations[pokemonLocations.length - 1]?.level || '',
            error: apiData.error,
            errorType: apiData.errorType,
          });
          continue;
        }

        pokedex.push({
          pokemon: pokemonName,
          biome: biomeName,
          locations: [
            {
              location: pokemonLocations[pokemonLocations.length - 1]?.location || '',
              level: pokemonLocations[pokemonLocations.length - 1]?.level || ''
            }
          ],
          description: apiData.description ,
          pokedexId: apiData.pokedexId,
          descriptionTranslated: apiData.descriptionTranslated,
          translatedTime: apiData.translatedTime
        });

        processedPokemon[pokemonName] = pokedex.length - 1;
      }
    }
  }

  saveToFile("localizacaoPokemons.json", pokemonLocations);
  saveToFile("pokedex.json", pokedex);
  saveToFile("pokemonsWithError.json", pokemonErrors);
}

function saveToFile(fileName: string, data: any) {
  const filePath = path.join(__dirname, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Arquivo salvo em: ${filePath}`);
}

processPokemonFile();
