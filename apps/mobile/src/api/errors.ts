// Kept apart from client.ts (which pulls in expo-secure-store) so pure helpers
// that only need to recognise an ApiError stay testable without React Native.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
