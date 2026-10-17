const hello = {
  async fetch(): Promise<Response> {
    return new Response("Hello from Neon Functions");
  },
};

export default hello;
