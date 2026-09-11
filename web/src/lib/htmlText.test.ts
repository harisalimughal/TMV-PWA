import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "./htmlText";

describe("htmlToPlainText", () => {
  it("passes plain text through unchanged", () => {
    expect(htmlToPlainText("Pick up address: 56 Bucklebury\nDrop off: 61")).toBe(
      "Pick up address: 56 Bucklebury\nDrop off: 61"
    );
  });

  it("turns <br> and block-closing tags into line breaks", () => {
    expect(htmlToPlainText("Name: A B<br>Email: a@b.com<br/><div>Phone: 123</div>")).toBe(
      "Name: A B\nEmail: a@b.com\nPhone: 123\n"
    );
  });

  it("strips remaining tags and decodes the common entities", () => {
    expect(htmlToPlainText("<b>Van Size:</b> Large &amp; Luton &lt;VAN&gt; &quot;X&quot; &#39;Y&#39;")).toBe(
      'Van Size: Large & Luton <VAN> "X" \'Y\''
    );
    expect(htmlToPlainText("Fee:&nbsp;£55")).toBe("Fee: £55");
  });
});
