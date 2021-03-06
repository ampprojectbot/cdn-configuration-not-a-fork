import fs from 'fs-extra';
import {createPullRequest} from 'octokit-plugin-create-pull-request';
import {Octokit} from '@octokit/rest';

const octokit = new (Octokit.plugin(createPullRequest))({
  auth: process.env.ACCESS_TOKEN,
});

const versionsJsonFile = 'configs/versions.json';
const params = {owner: 'danielrozenberg', repo: 'cdn-configuration-not-a-fork'};

// TODO(danielrozenberg): change to @ampproject/release-on-duty after testing is done.
const releaseOnDuty = '@danielrozenberg';

type Versions = Record<string, string | null>;
type CreatePullRequestResponsePromise = ReturnType<
  typeof octokit.createPullRequest
>;

interface VersionMutatorDef {
  versionsChanges: Versions;
  title: string;
  body: string;
  branch: string;
}

/**
 * Helper used by promote related CI job scripts.
 */
export async function runPromoteJob(
  jobName: string,
  workflow: () => Promise<void>
): Promise<void> {
  console.log('Running', `${jobName}...`);
  try {
    await workflow();
    console.log('Done running', `${jobName}.`);
  } catch (err) {
    console.error('Job', jobName, 'failed.');
    console.error('ERROR:', err);
    process.exitCode = 1;
  }
}

/**
 * Creates a pull request to update versions.json.
 */
export async function createVersionsUpdatePullRequest(
  versionsMutator: (currentVersions: Versions) => VersionMutatorDef
): CreatePullRequestResponsePromise {
  if (!process.env.ACCESS_TOKEN) {
    throw new Error('Environment variable ACCESS_TOKEN is missing');
  }

  const currentVersions = (await fs.readJson(
    versionsJsonFile,
    'utf8'
  )) as Versions;
  const {body, title, versionsChanges, branch} =
    versionsMutator(currentVersions);

  const newVersions: Versions = {
    ...currentVersions,
    ...versionsChanges,
  };

  const pullRequestResponse = await octokit.createPullRequest({
    ...params,
    title,
    body: `${body}\n\n${releaseOnDuty}`,
    head: `promote-job-${branch}`,
    changes: [
      {
        files: {
          [versionsJsonFile]: JSON.stringify(newVersions, undefined, 2) + '\n',
        },
        commit: title,
      },
    ],
    createWhenEmpty: false,
  });

  if (!pullRequestResponse || pullRequestResponse.status !== 201) {
    throw new Error('Failed to create a pull request');
  }

  return pullRequestResponse;
}
