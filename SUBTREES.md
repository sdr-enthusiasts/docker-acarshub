# Subtrees

## [airframesio/acars-decoder-typescript](https://github.com/airframesio/acars-decoder-typescript)

Has been added with prefix `/acars-decoder-typescript`, using "master" branch

The reasoning behind this at the time was:

- Allows us to make changes to `acars-decoder-typescript` in our repository, rebuild the container and immediately see the changes.
- We can create our own forks of `airframesio/acars-decoder-typescript`, split the changes from our subtree into our forks, and submit PRs to `airframesio/acars-decoder-typescript`.

See this gist for more info: <https://gist.github.com/kvnsmth/4688345> ("Be a good open source citizen" section)

**To update the Subtree:**

```bash
git subtree pull --prefix acars-decoder-typescript https://github.com/airframesio/acars-decoder-typescript.git master
```

**To split changes into a fork:**

1. Create a personal fork of `airframesio/acars-decoder-typescript`
2. In your local `fredclausen/docker-acarshub` repo:

```bash
git subtree split --prefix=acars-decoder-typescript --branch <NEW_BRANCH_NAME>
```

3. Push changes local `fredclausen/docker-acarshub` into fork:

```bash
git push <GITHUB_FORK_URL> <NEW_BRANCH_NAME>:<NEW_REMOTE_BRANCH_NAME>
```

4. Issue a PR from your personal fork of `acars-decoder-typescript` to `airframesio/acars-decoder-typescript`
