export type SnapshotData = {
  text: string;
  updatedAt: number;
};

export class Snapshot {
  private constructor(
    readonly text: string,
    readonly updatedAt: number,
  ) {}

  static stash(text: string): Snapshot {
    return new Snapshot(text, Date.now());
  }

  static fromData(data: unknown): Snapshot | null {
    const candidate = data as Partial<SnapshotData> | undefined;
    if (typeof candidate?.text !== "string" || candidate.text.length === 0) {
      return null;
    }

    const updatedAt =
      typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0;

    return new Snapshot(candidate.text, updatedAt);
  }

  toData(): SnapshotData {
    return { text: this.text, updatedAt: this.updatedAt };
  }
}
