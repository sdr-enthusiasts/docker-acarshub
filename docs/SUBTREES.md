# Subtrees

## [airframesio/acars-decoder-typescript](https://github.com/airframesio/acars-decoder-typescript)

Has been added with prefix `/acars-decoder-typescript`, using "master" branch

The reasoning behind this at the time was:

* Allows us to make changes to `acars-decoder-typescript` in our repository, rebuild the container and immediately see the changes.
* We can create our own forks of `airframesio/acars-decoder-typescript`, split the changes from our subtree into our forks, and submit PRs to `airframesio/acars-decoder-typescript`.

See this gist for more info: <https://gist.github.com/kvnsmth/4688345> ("Be a good open source citizen" section)

**To update the Subtree:**

Ensure you have remote added (not sure if this is required for every clone for this repository...)

```bash
git remote add -f acars-decoder-typescript https://github.com/airframesio/acars-decoder-typescript.git
git subtree add -P acars-decoder-typescript acars-decoder-typescript master
```

Then to update it

```bash
git subtree pull --prefix acars-decoder-typescript acars-decoder-typescript master --squash
```

**To split changes into a fork:**

1. Create a personal fork of `airframesio/acars-decoder-typescript`
1. In your local `fredclausen/docker-acarshub` repo:

    `git subtree split --prefix=acars-decoder-typescript --branch <NEW_BRANCH_NAME>`

1. Push changes local `fredclausen/docker-acarshub` into fork:

    `git push <GITHUB_FORK_URL> <NEW_BRANCH_NAME>:<NEW_REMOTE_BRANCH_NAME>`

1. Issue a PR from your personal fork of `acars-decoder-typescript` to `airframesio/acars-decoder-typescript`
