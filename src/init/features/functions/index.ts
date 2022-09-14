import * as clc from "colorette";

import { logger } from "../../../logger";
import { promptOnce } from "../../../prompt";
import { requirePermissions } from "../../../requirePermissions";
import { previews } from "../../../previews";
import { Options } from "../../../options";
import { ensure } from "../../../ensureApiEnabled";
import { Config } from "../../../config";
import {
  normalizeAndValidate,
  configForCodebase,
  suggestCodebaseName,
  validateCodebase,
  assertUnique,
} from "../../../functions/projectConfig";
import { FirebaseError } from "../../../error";

const MAX_ATTEMPTS = 5;

/**
 * Set up a new firebase project for functions.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<any> {
  const projectId = setup?.rcfile?.projects?.default;
  if (projectId) {
    await requirePermissions({ ...options, project: projectId });
    await Promise.all([
      ensure(projectId, "cloudfunctions.googleapis.com", "unused", true),
      ensure(projectId, "runtimeconfig.googleapis.com", "unused", true),
    ]);
  }
  setup.functions = {};
  // check if functions have been initialized yet
  if (!config.src.functions) {
    setup.config.functions = [];
    return initNewCodebase(setup, config);
  }

  logger.info(`\nDetected ${clc.bold("existing codebase(s).\n")}`);
  setup.config.functions = normalizeAndValidate(setup.config.functions);
  const choices = [
    {
      name: "Initialize",
      value: "new",
    },
    {
      name: "Re-initialize",
      value: "reinit",
    },
  ];
  const initOpt = await promptOnce({
    type: "list",
    message: "Would you like to initialize a new codebase, or reinitialize an existing one?",
    default: "new",
    choices,
  });
  return initOpt === "new" ? initNewCodebase(setup, config) : reinitCodebase(setup, config);
}

/**
 *  User dialogue to set up configuration for functions codebase.
 */
async function initNewCodebase(setup: any, config: Config): Promise<any> {
  logger.info("Let's create a new codebase for your functions.");
  logger.info("A directory corresponding to the codebase will be created in your project");
  logger.info("with sample code pre-configured.\n");

  logger.info("See https://firebase.google.com/docs/functions/organize-functions for");
  logger.info("more information on organizing your functions using codebases.\n");

  logger.info(`Functions can be deployed with ${clc.bold("firebase deploy")}.\n`);

  let source: string;
  let codebase: string;

  let attempts = 0;
  while (true) {
    if (attempts >= MAX_ATTEMPTS) {
      throw new FirebaseError(
        "Exceeded max number of attempts to input valid source. Please restart."
      );
    }
    attempts++;
    source = await promptOnce({
      type: "input",
      message: "Where would you like to initialize your new functions source?",
      default: "functions",
    });
    try {
      assertUnique(setup.config.functions, "source", source);
      break;
    } catch (err: any) {
      logger.error(err as FirebaseError);
    }
  }

  attempts = 0;
  while (true) {
    if (attempts >= MAX_ATTEMPTS) {
      throw new FirebaseError(
        "Exceeded max number of attempts to input valid codebase name. Please restart."
      );
    }
    attempts++;
    codebase = await promptOnce({
      type: "input",
      message: "What should be the name of this codebase?",
      default: suggestCodebaseName(source),
    });
    try {
      validateCodebase(codebase);
      assertUnique(setup.config.functions, "codebase", codebase);
      break;
    } catch (err: any) {
      logger.error(err as FirebaseError);
    }
  }

  setup.config.functions.push({
    source,
    codebase,
  });
  setup.functions.source = source;
  setup.functions.codebase = codebase;
  return languageSetup(setup, config);
}

async function reinitCodebase(setup: any, config: Config): Promise<any> {
  let codebase;
  if (setup.config.functions.length > 1) {
    const choices = setup.config.functions.map((cfg: any) => ({
      name: cfg["codebase"],
      value: cfg["codebase"],
    }));
    codebase = await promptOnce({
      type: "list",
      message: "Which codebase would you like to re-initialize?",
      choices,
    });
  } else {
    codebase = setup.config.functions[0].codebase; // only one codebase exists
  }

  const cbconfig = configForCodebase(setup.config.functions, codebase);
  setup.functions.source = cbconfig.source;
  setup.functions.codebase = cbconfig.codebase;

  logger.info(`\nRe-initializing ${clc.bold(`codebase ${codebase}...\n`)}`);
  return languageSetup(setup, config);
}

/**
 * User dialogue to set up configuration for functions codebase language choice.
 */
async function languageSetup(setup: any, config: Config): Promise<any> {
  const choices = [
    {
      name: "JavaScript",
      value: "javascript",
    },
    {
      name: "TypeScript",
      value: "typescript",
    },
  ];
  if (previews.golang) {
    choices.push({
      name: "Go",
      value: "golang",
    });
  }
  const language = await promptOnce({
    type: "list",
    message: "What language would you like to use to write Cloud Functions?",
    default: "javascript",
    choices,
  });
  const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
  switch (language) {
    case "javascript":
      cbconfig.ignore = ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"];
      break;
    case "typescript":
      cbconfig.ignore = ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"];
      break;
  }
  return require("./" + language).setup(setup, config);
}
