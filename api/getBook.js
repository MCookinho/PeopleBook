export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");

    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;
    const BOOK_FILE = "livro.json";

    try {
        const response = await fetch(
            `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${BOOK_FILE}`
        );

        if (!response.ok) {
            return res.status(200).json({
                title: "The People's Book",
                chapters: [],
            });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        return res.status(200).json({
            title: "The People's Book",
            chapters: [],
        });
    }
}
