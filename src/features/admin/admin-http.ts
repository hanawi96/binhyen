export const CONTENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function adminJson(
  body: unknown,
  status: number
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function readJsonBody(
  request: Request,
  limit = 20000
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: Response }
> {
  try {
    const text = await request.text();

    if (text.length > limit) {
      return {
        ok: false,
        response: adminJson(
          { success: false, error: "Nội dung gửi lên quá dài." },
          400
        )
      };
    }

    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: adminJson(
        { success: false, error: "Yêu cầu không đọc được." },
        400
      )
    };
  }
}
