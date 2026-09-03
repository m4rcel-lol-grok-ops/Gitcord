import { GitProvider } from "./GitProvider";
import { GitHubProvider } from "./GitHubProvider";
import { GitLabProvider } from "./GitLabProvider";
import { GiteaProvider } from "./GiteaProvider";
import { ForgejoProvider } from "./ForgejoProvider";
import { GenericProvider } from "./GenericProvider";
import { config } from "../../config";
import { logger } from "../../utils/logger";

export class ProviderRegistry {
  private providers: GitProvider[] = [];
  private fallbackProvider: GenericProvider;
  private instanceProviderCache: Map<string, GitProvider> = new Map();

  constructor() {
    // Initialize provider instances with tokens if configured
    this.providers = [
      new ForgejoProvider(config.forgejoToken || config.giteaToken),
      new GiteaProvider(config.giteaToken),
      new GitHubProvider(config.githubToken),
      new GitLabProvider(config.gitlabToken),
    ];
    this.fallbackProvider = new GenericProvider();
  }

  registerProvider(provider: GitProvider): void {
    this.providers.unshift(provider);
    this.instanceProviderCache.clear();
  }

  getProviderByType(type: string): GitProvider {
    const match = this.providers.find((p) => p.type.toLowerCase() === type.toLowerCase());
    return match || this.fallbackProvider;
  }

  async resolveProviderForUrl(instanceUrl: string, providerHint?: string): Promise<GitProvider> {
    const norm = instanceUrl.toLowerCase().replace(/\/+$/, "");

    if (providerHint) {
      const hinted = this.getProviderByType(providerHint);
      if (hinted.type !== "generic") {
        this.instanceProviderCache.set(norm, hinted);
        return hinted;
      }
    }

    const cached = this.instanceProviderCache.get(norm);
    if (cached) return cached;

    // Fast domain check first
    if (norm.includes("github.com")) {
      const gh = this.getProviderByType("github");
      this.instanceProviderCache.set(norm, gh);
      return gh;
    }
    if (norm.includes("gitlab.com")) {
      const gl = this.getProviderByType("gitlab");
      this.instanceProviderCache.set(norm, gl);
      return gl;
    }
    if (norm.includes("codeberg.org")) {
      const fj = this.getProviderByType("forgejo");
      this.instanceProviderCache.set(norm, fj);
      return fj;
    }

    // Dynamic detection across registered providers
    for (const provider of this.providers) {
      try {
        const matches = await provider.detectInstance(instanceUrl);
        if (matches) {
          logger.debug(`Detected provider ${provider.name} for instance: ${instanceUrl}`);
          this.instanceProviderCache.set(norm, provider);
          return provider;
        }
      } catch (err) {
        logger.debug(`Detection error for provider ${provider.name} on ${instanceUrl}: ${(err as Error).message}`);
      }
    }

    logger.debug(`Using fallback GenericProvider for instance: ${instanceUrl}`);
    this.instanceProviderCache.set(norm, this.fallbackProvider);
    return this.fallbackProvider;
  }
}

export const providerRegistry = new ProviderRegistry();
export { GitProvider, GitHubProvider, GitLabProvider, GiteaProvider, ForgejoProvider, GenericProvider };
