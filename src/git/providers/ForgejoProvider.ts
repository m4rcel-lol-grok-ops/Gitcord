import { GiteaProvider } from "./GiteaProvider";

export class ForgejoProvider extends GiteaProvider {
  override readonly name: string = "Forgejo";
  override readonly type: string = "forgejo";
  override readonly iconUrl: string = "https://codeberg.org/assets/img/logo.svg";
  override readonly color: number = 0xfe5323;

  override async detectInstance(baseUrl: string): Promise<boolean> {
    const norm = baseUrl.toLowerCase().replace(/\/+$/, "");
    if (norm.includes("codeberg.org") || norm.includes("forgejo")) {
      return true;
    }

    try {
      const res = await this.httpClient.get<{ version?: string }>(`${norm}/api/v1/version`);
      if (res.status === 200 && typeof res.data?.version === "string") {
        return res.data.version.toLowerCase().includes("forgejo") || norm.includes("codeberg");
      }
      return false;
    } catch {
      return false;
    }
  }
}
