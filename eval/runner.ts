import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import YAML from "yaml";
import { generateBrief } from "../src/core/pipeline.js";
import type { RetrievedQuote, UncheckedConnector } from "../src/core/types.js";
import type { SourceBlock } from "../src/core/sourceFormatter.js";
import briefSchema from "./schema/brief.v1.json" with { type: "json" };

const AjvClass = (Ajv as any).default || Ajv;
const addFormatsFn = (addFormats as any).default || addFormats;
const ajv = new AjvClass({ allErrors: true });
addFormatsFn(ajv);
const validateBriefSchema = ajv.compile(briefSchema);

const FIXTURES_DIR = path.resolve(process.cwd(), "eval/fixtures");
const RESULTS_DIR = path.resolve(process.cwd(), "eval/results");

export interface FixtureSourcesConfig {
  mode: "home" | "world";
  sources: SourceBlock[];
  retrieved: RetrievedQuote[];
  unchecked?: UncheckedConnector[];
}

export async function runAllFixtures() {
  await fs.mkdir(RESULTS_DIR, { recursive: true });

  const entries = await fs.readdir(FIXTURES_DIR, { withFileTypes: true });
  const fixtureDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  console.log(`=== Ballast Phase 0: Standalone Critic & Pipeline Runner ===`);
  console.log(`Found ${fixtureDirs.length} fixtures in ${FIXTURES_DIR}\n`);

  const results: Record<string, unknown> = {};

  for (const dirName of fixtureDirs) {
    const fixturePath = path.join(FIXTURES_DIR, dirName);
    console.log(`[RUN] Executing fixture: ${dirName}`);

    const questionFile = path.join(fixturePath, "question.txt");
    const sourcesFile = path.join(fixturePath, "sources.json");
    const expectedFile = path.join(fixturePath, "expected.yml");

    const question = (await fs.readFile(questionFile, "utf-8")).trim();
    const sourcesConfig: FixtureSourcesConfig = JSON.parse(
      await fs.readFile(sourcesFile, "utf-8")
    );
    const expected = YAML.parse(await fs.readFile(expectedFile, "utf-8"));

    const pipelineResult = await generateBrief({
      question,
      mode: sourcesConfig.mode,
      sources: sourcesConfig.sources,
      retrieved: sourcesConfig.retrieved,
      unchecked: sourcesConfig.unchecked || [],
    });

    const isBriefSchemaValid = validateBriefSchema(pipelineResult.brief);
    if (!isBriefSchemaValid) {
      console.error(
        `  ❌ Brief JSON Schema error on ${dirName}:`,
        validateBriefSchema.errors
      );
    } else {
      console.log(`  ✓ Brief JSON Schema validated`);
    }

    console.log(`  Status: ${pipelineResult.brief.status}`);
    console.log(
      `  Claims in: ${pipelineResult.criticLog.claims_in} | Kept: ${pipelineResult.criticLog.claims_kept} | Dropped: ${pipelineResult.criticLog.claims_dropped}`
    );
    if (pipelineResult.criticLog.conflicts.length > 0) {
      console.log(
        `  Conflicts detected: ${pipelineResult.criticLog.conflicts.length}`
      );
    }

    // Write outputs to eval/results
    const markdownPath = path.join(RESULTS_DIR, `${dirName}.md`);
    const criticLogPath = path.join(RESULTS_DIR, `${dirName}.critic_log.json`);
    const briefPath = path.join(RESULTS_DIR, `${dirName}.brief.json`);

    await fs.writeFile(markdownPath, pipelineResult.brief.markdown, "utf-8");
    await fs.writeFile(
      criticLogPath,
      JSON.stringify(pipelineResult.criticLog, null, 2),
      "utf-8"
    );
    await fs.writeFile(
      briefPath,
      JSON.stringify(pipelineResult.brief, null, 2),
      "utf-8"
    );

    results[dirName] = {
      brief: pipelineResult.brief,
      criticLog: pipelineResult.criticLog,
      expected,
      schemaValid: isBriefSchemaValid,
    };
    console.log(`  Artifacts saved to eval/results/${dirName}.*\n`);
  }

  return results;
}

// Direct execution
if (process.argv[1]?.endsWith("runner.ts")) {
  runAllFixtures().catch((err) => {
    console.error("Runner failed with exception:", err);
    process.exit(1);
  });
}
