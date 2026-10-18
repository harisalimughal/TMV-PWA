import { describe, expect, it } from "vitest";
import { DEFAULT_DESTINATION, destinationProblem } from "./notificationDestination";

describe("destinationProblem", () => {
  it.each([DEFAULT_DESTINATION, "/", "/?tab=van", "/?tab=activity&job=TMV-1"])("allows %s", value => expect(destinationProblem(value)).toBe(""));
  it.each(["", "https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "/admin", "/?tab=secrets", "/?next=http://x", "/?tab=jobs#x", "/?job=TMV-1", "/?tab=activity", "/ ?tab=jobs"])("refuses %j", value => expect(destinationProblem(value)).not.toBe(""));
});
