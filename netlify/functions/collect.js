export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  // In una implementazione reale, qui si attiverebbero le chiamate Meta/TikTok API
  console.log("Data collection triggered");

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Data collection started" }),
  };
};
