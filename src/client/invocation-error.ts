/**
 * I205 / §14.34: keep the Main-provided message separate from transport
 * diagnostics. Author presentation still filters that message; advanced views
 * retain code/method in Error.message. This is not a new wire contract.
 */
export class ClientInvocationError extends Error {
  readonly invocationMessage: string;
  constructor(message: string, diagnostics: readonly string[]) {
    super(diagnostics.length === 0 ? message : `${message} [${diagnostics.join('; ')}]`);
    this.invocationMessage = message;
  }
}
