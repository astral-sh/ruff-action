import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as pep440 from "@renovatebot/pep440";
import { getAllVersions, getLatestVersion } from "../download/manifest";
import {
  type ParsedVersionSpecifier,
  parseVersionSpecifier,
} from "./specifier";
import type { ResolveRuffVersionOptions } from "./types";
import { resolveVersionRequest } from "./version-request-resolver";

interface ConcreteVersionResolutionContext {
  manifestUrl?: string;
  parsedSpecifier: ParsedVersionSpecifier;
}

interface ConcreteVersionResolver {
  resolve(
    context: ConcreteVersionResolutionContext,
  ): Promise<string | undefined>;
}

class ExactVersionResolver implements ConcreteVersionResolver {
  async resolve(
    context: ConcreteVersionResolutionContext,
  ): Promise<string | undefined> {
    if (context.parsedSpecifier.kind !== "exact") {
      return undefined;
    }

    core.debug(
      `Version ${context.parsedSpecifier.normalized} is an explicit version.`,
    );
    return context.parsedSpecifier.normalized;
  }
}

class LatestVersionResolver implements ConcreteVersionResolver {
  async resolve(
    context: ConcreteVersionResolutionContext,
  ): Promise<string | undefined> {
    if (context.parsedSpecifier.kind !== "latest") {
      return undefined;
    }

    return await getLatestVersion(context.manifestUrl);
  }
}

class RangeVersionResolver implements ConcreteVersionResolver {
  async resolve(
    context: ConcreteVersionResolutionContext,
  ): Promise<string | undefined> {
    if (context.parsedSpecifier.kind !== "range") {
      return undefined;
    }

    const availableVersions = await getAllVersions(context.manifestUrl);
    const resolvedVersion = maxSatisfying(
      availableVersions,
      context.parsedSpecifier.normalized,
    );
    if (resolvedVersion === undefined) {
      throw new Error(`No version found for ${context.parsedSpecifier.raw}`);
    }

    core.debug(`Resolved version: ${resolvedVersion}`);
    return resolvedVersion;
  }
}

const CONCRETE_VERSION_RESOLVERS: ConcreteVersionResolver[] = [
  new ExactVersionResolver(),
  new LatestVersionResolver(),
  new RangeVersionResolver(),
];

export async function resolveRuffVersion(
  options: ResolveRuffVersionOptions,
): Promise<string> {
  const request = resolveVersionRequest(options);
  return await resolveVersion(request.specifier, options.manifestFile);
}

export async function resolveVersion(
  versionInput: string,
  manifestUrl?: string,
): Promise<string> {
  core.debug(`Resolving ${versionInput}...`);

  const context: ConcreteVersionResolutionContext = {
    manifestUrl,
    parsedSpecifier: parseVersionSpecifier(versionInput),
  };

  for (const resolver of CONCRETE_VERSION_RESOLVERS) {
    const version = await resolver.resolve(context);
    if (version !== undefined) {
      return version;
    }
  }

  throw new Error(`No version found for ${versionInput}`);
}

function maxSatisfying(
  versions: string[],
  version: string,
): string | undefined {
  const maxSemver = tc.evaluateVersions(versions, version);
  if (maxSemver !== "") {
    core.debug(`Found a version that satisfies the semver range: ${maxSemver}`);
    return maxSemver;
  }

  const maxPep440 = pep440.maxSatisfying(versions, version);
  if (maxPep440 !== null) {
    core.debug(
      `Found a version that satisfies the pep440 specifier: ${maxPep440}`,
    );
    return maxPep440;
  }

  return undefined;
}
