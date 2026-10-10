
export default {
  async fetch(request) {
    const message = "Hello worrlkej!";
    console.log(message);

    return new Response(message, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
};
