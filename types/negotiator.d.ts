declare module 'negotiator' {
  interface Headers {
    'accept-language'?: string;
  }

  class Negotiator {
    constructor(options: { headers: Headers });
    languages(): string[];
  }

  export = Negotiator;
}

