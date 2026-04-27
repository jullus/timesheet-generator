#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { input, confirm, checkbox, select } from '@inquirer/prompts';
import { globalConfig, ConfigManager } from './config';
import { SecretsManager } from './secrets';
import { CacheManager } from './cache';
import { BitbucketProvider } from './providers/bitbucket';
import { GitHubProvider } from './providers/github';
import { GitLabProvider } from './providers/gitlab';
import { LocalGitProvider } from './providers/localGit';
import { HeuristicEngine } from './heuristics';
import { ReportGenerator } from './reports';

const program = new Command();

program
  .name('ggts')
  .description('Git Activity Aggregation and Timesheet CLI')
  .version('1.0.0');

program
  .command('setup')
  .description('Interactive wizard to set up providers and configuration')
  .action(async () => {
    console.log('--- GGTS Setup ---');
    console.log('Tip: Have your API tokens ready (see README.md for details)\n');
    
    // Providers
    const activeProviders = await checkbox({
      message: 'Select which providers you want to use (Press <Space> to select):',
      required: true,
      choices: [
        { name: 'Bitbucket (Remote)', value: 'bitbucket', checked: !!globalConfig.providers.bitbucket },
        { name: 'GitHub (Remote)', value: 'github', checked: !!globalConfig.providers.github },
        { name: 'GitLab (Remote)', value: 'gitlab', checked: !!globalConfig.providers.gitlab },
      ]
    });

    if (activeProviders.includes('bitbucket')) {
      const wsInput = await input({ 
        message: 'Bitbucket Workspace slug (found in your URL: bitbucket.org/WORKSPACE/):', 
        default: globalConfig.providers.bitbucket?.workspace 
      });
      let ws = wsInput.trim();
      const match = ws.match(/bitbucket\.org\/([^\/]+)/);
      if (match) ws = match[1];
      
      globalConfig.providers.bitbucket = { 
        workspace: ws, 
        repos: globalConfig.providers.bitbucket?.repos 
      };
      
      const bbUser = await input({ 
        message: 'Bitbucket Username (or email used for login):',
        transformer: (val) => val.trim()
      });
      const bbPass = await input({ 
        message: 'Bitbucket App Password [Needs "Repositories: Read" scope]:',
        transformer: (val) => val.trim()
      });

      if (bbUser && bbPass) {
        await SecretsManager.setToken('bitbucket', `${bbUser}:${bbPass}`);
      } else if (bbPass) {
        // Fallback for just token/pass if user doesn't provide username (though prompt asks for it)
        await SecretsManager.setToken('bitbucket', bbPass);
      }

      const pickRepos = await confirm({ message: 'Do you want to re-select Bitbucket repositories?', default: false });
      if (pickRepos) {
        const p = new BitbucketProvider(ws);
        const allRepos = await p.getRepositories();
        globalConfig.providers.bitbucket.repos = await checkbox({
          message: 'Select Bitbucket repositories (Press <a> to toggle all):',
          choices: allRepos.map(r => ({ 
            name: r, 
            value: r, 
            checked: globalConfig.providers.bitbucket?.repos?.includes(r) ?? true 
          }))
        });
      }
    }

    if (activeProviders.includes('github')) {
      const ownerInput = await input({ 
        message: 'GitHub Owner (username or organization name):', 
        default: globalConfig.providers.github?.owner 
      });
      let owner = ownerInput.trim();
      const match = owner.match(/github\.com\/([^\/]+)/);
      if (match) owner = match[1];
      
      globalConfig.providers.github = { 
        owner: owner, 
        repos: globalConfig.providers.github?.repos 
      };
      const token = await input({ 
        message: 'GitHub Personal Access Token (classic) [Needs "repo" scope]:',
        transformer: (val) => val.trim()
      });
      if (token) await SecretsManager.setToken('github', token);

      const pickRepos = await confirm({ message: 'Do you want to re-select GitHub repositories?', default: false });
      if (pickRepos) {
        const p = new GitHubProvider(owner);
        const allRepos = await p.getRepositories();
        globalConfig.providers.github.repos = await checkbox({
          message: 'Select GitHub repositories (Press <a> to toggle all):',
          choices: allRepos.map(r => ({ 
            name: r, 
            value: r, 
            checked: globalConfig.providers.github?.repos?.includes(r) ?? true 
          }))
        });
      }
    }

    if (activeProviders.includes('gitlab')) {
      const pidInput = await input({ 
        message: 'GitLab Project ID or Path (e.g. 12345 or group/project):', 
        default: globalConfig.providers.gitlab?.projectId 
      });
      let pid = pidInput.trim();
      const match = pid.match(/gitlab\.com\/([^\/]+)/);
      if (match) pid = match[1];
      globalConfig.providers.gitlab = { projectId: pid };
      const token = await input({ 
        message: 'GitLab Personal Access Token [Needs "read_api" scope]:',
        transformer: (val) => val.trim()
      });
      if (token) await SecretsManager.setToken('gitlab', token);
    }

    // Authors
    if (globalConfig.authors.length > 0) {
      console.log('\nCurrent Authors:');
      globalConfig.authors.forEach((a, i) => console.log(`  ${i + 1}. ${a.name} <${a.email}>`));
      
      const authorAction = await select({
        message: 'Manage Authors:',
        choices: [
          { name: 'Keep current authors', value: 'keep' },
          { name: 'Add a new author', value: 'add' },
          { name: 'Remove an author', value: 'remove' },
          { name: 'Clear all and start over', value: 'clear' },
        ]
      });

      if (authorAction === 'add') {
        const name = await input({ message: 'Author Name to track:' });
        const email = await input({ message: 'Author Email to track:' });
        globalConfig.authors.push({ name, email });
      } else if (authorAction === 'remove') {
        const toRemove = await select({
          message: 'Select author to remove:',
          choices: globalConfig.authors.map((a, i) => ({ name: `${a.name} <${a.email}>`, value: i }))
        });
        globalConfig.authors.splice(toRemove, 1);
      } else if (authorAction === 'clear') {
        globalConfig.authors = [];
      }
    }

    if (globalConfig.authors.length === 0) {
      console.log('\nNo authors configured. Adding the first one:');
      let more = true;
      while (more) {
        const name = await input({ message: 'Author Name to track:' });
        const email = await input({ message: 'Author Email to track:' });
        globalConfig.authors.push({ name, email });
        more = await confirm({ message: 'Add another author alias?', default: false });
      }
    }

    // Additional Info (PDF Header)
    const info = await input({ 
      message: 'Additional Info for PDF headers (e.g., "Your Name | Company Name"):',
      default: globalConfig.additionalInfo 
    });
    globalConfig.additionalInfo = info.trim() || undefined;

    ConfigManager.save(globalConfig);
    console.log(`Setup complete! Configuration saved to ${path.join(process.cwd(), '.ggts', 'config.json')}`);
  });

program
  .command('fetch')
  .description('Fetch all commits from configured providers and save locally')
  .option('--year <year>', 'Year to fetch commits for (e.g. 2025)')
  .option('--years <count>', 'Fetch commits for the past X years')
  .option('--month <month>', 'Specific month to fetch (YYYY-MM)')
  .option('--missing-months', 'Only fetch months that are completely missing from cache', false)
  .option('--force', 'Force re-fetch of already cached months', false)
  .action(async (options) => {
    let since: Date;
    let until: Date = new Date();
    let displayTitle: string;

    if (options.month) {
      const parts = options.month.split('-');
      if (parts.length !== 2) throw new Error('Month must be in YYYY-MM format');
      since = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
      until = new Date(parseInt(parts[0]), parseInt(parts[1]), 0, 23, 59, 59);
      displayTitle = `Month ${options.month}`;
    } else if (options.years) {
      const count = parseInt(options.years);
      since = new Date();
      since.setFullYear(until.getFullYear() - count);
      displayTitle = `Past ${count} Years`;
    } else {
      const year = options.year ? parseInt(options.year) : new Date().getFullYear();
      since = new Date(year, 0, 1);
      until = new Date(year, 11, 31, 23, 59, 59);
      displayTitle = `Year ${year}`;
    }

    const now = new Date();
    if (until > now) {
      until = now;
    }

    const globalConfig = ConfigManager.load();
    const existingCommits = CacheManager.loadCommits();

    // Only do incremental if no explicit range is requested
    if (!options.year && !options.years && !options.month && !options.missingMonths && !options.force && existingCommits.length > 0) {
      const latestTimestamp = Math.max(...existingCommits.map(c => c.timestamp.getTime()));
      since = new Date(latestTimestamp + 1);
      displayTitle = `Incremental (since ${since.toLocaleString()})`;
      console.log(`\nFound ${existingCommits.length} cached commits.`);
    }

    console.log(`--- Fetching Commits: ${displayTitle} ---`);
    console.log(`Date range: ${since.toLocaleDateString()} to ${until.toLocaleDateString()}`);
    if (options.missingMonths) console.log('Mode: Missing Months Only');
    
    if (!globalConfig.providers || Object.keys(globalConfig.providers).length === 0) {
      console.log('⚠️  No providers are currently configured!');
      return;
    }

    const authorPatterns = globalConfig.authors.map(a => a.email).concat(globalConfig.authors.map(a => a.name));
    console.log(`Matching authors: ${authorPatterns.length > 0 ? authorPatterns.join(', ') : 'All authors'}`);

    // Pre-scan repositories for all providers to avoid redundant lookups
    const providerRepos: Record<string, string[]> = {};
    if (globalConfig.providers.bitbucket) {
      const conf = globalConfig.providers.bitbucket;
      if (conf.repos && conf.repos.length > 0) {
        providerRepos.bitbucket = conf.repos;
      } else {
        process.stdout.write(`▶ Bitbucket: Discovering repositories... `);
        const p = new BitbucketProvider(conf.workspace);
        providerRepos.bitbucket = await p.getRepositories();
      }
    }
    if (globalConfig.providers.github) {
      const conf = globalConfig.providers.github;
      if (conf.repos && conf.repos.length > 0) {
        providerRepos.github = conf.repos;
      } else {
        process.stdout.write(`▶ GitHub: Discovering repositories... `);
        const p = new GitHubProvider(conf.owner);
        providerRepos.github = await p.getRepositories();
      }
    }

    let fetchedCommits: any[] = [];
    
    // Iterate month by month
    let iterDate = new Date(since.getFullYear(), since.getMonth(), 1);
    while (iterDate <= until) {
      const mSince = new Date(Math.max(since.getTime(), iterDate.getTime()));
      const mUntil = new Date(iterDate.getFullYear(), iterDate.getMonth() + 1, 0, 23, 59, 59);
      if (mUntil > until) mUntil.setTime(until.getTime());

      const monthLabel = iterDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      const monthKey = `${iterDate.getFullYear()}-${String(iterDate.getMonth() + 1).padStart(2, '0')}`;
      const isPastMonth = mUntil < new Date();

      if (options.missingMonths && CacheManager.hasMonthFile(monthKey)) {
          // Skip if month file already exists
          iterDate.setMonth(iterDate.getMonth() + 1);
          continue;
      }

      console.log(`\n📅 Processing ${monthLabel}...`);

      if (globalConfig.providers.bitbucket && providerRepos.bitbucket) {
        const conf = globalConfig.providers.bitbucket;
        for (const r of providerRepos.bitbucket) {
          // Skip if: Not forced AND not a targeted month/missing fetch AND it's a past month already synced
          if (!options.force && !options.month && !options.missingMonths && isPastMonth && CacheManager.isSynced(monthKey, r)) {
            continue;
          }
          const p = new BitbucketProvider(conf.workspace, r);
          const commits = await p.fetchCommits(mSince, mUntil, authorPatterns);
          if (commits.length > 0) {
            process.stdout.write(`  [Bitbucket] ${r}: ${commits.length} commits\n`);
            fetchedCommits = fetchedCommits.concat(commits);
          }
          if (isPastMonth) CacheManager.markSynced(monthKey, r);
        }
      }

      if (globalConfig.providers.github && providerRepos.github) {
        const conf = globalConfig.providers.github;
        for (const r of providerRepos.github) {
          if (!options.force && !options.month && !options.missingMonths && isPastMonth && CacheManager.isSynced(monthKey, r)) {
            continue;
          }
          const p = new GitHubProvider(conf.owner, r);
          const commits = await p.fetchCommits(mSince, mUntil, authorPatterns);
          if (commits.length > 0) {
            process.stdout.write(`  [GitHub] ${r}: ${commits.length} commits\n`);
            fetchedCommits = fetchedCommits.concat(commits);
          }
          if (isPastMonth) CacheManager.markSynced(monthKey, r);
        }
      }

      if (globalConfig.providers.gitlab) {
        const p = new GitLabProvider(globalConfig.providers.gitlab.projectId);
        const commits = await p.fetchCommits(mSince, mUntil, authorPatterns);
        if (commits.length > 0) {
          process.stdout.write(`  [GitLab]: ${commits.length} commits\n`);
          fetchedCommits = fetchedCommits.concat(commits);
        }
      }

      iterDate.setMonth(iterDate.getMonth() + 1);
    }

    // Save fetched commits
    if (fetchedCommits.length > 0) {
        console.log(`\nRunning time estimation engine for ${fetchedCommits.length} new commits...`);
        const engine = new HeuristicEngine(globalConfig.sessionTimeout);
        const estimated = engine.calculateDurations(fetchedCommits);
        CacheManager.saveCommits(estimated);
    }
    
    const finalTotal = CacheManager.loadCommits().length;
    console.log(`\nTotal commits in cache: ${finalTotal}`);
    console.log(`✅ Fetch complete.`);
  });

  });

program
  .command('timesheet')
  .description('Generate filled 8h/day monthly reports in timesheets/ folder')
  .option('--year <year>', 'Generate reports for a specific year')
  .option('--years <count>', 'Generate reports for the past X years')
  .option('--since <date>', 'Start date (YYYY-MM-DD)')
  .option('--until <date>', 'End date (YYYY-MM-DD)')
  .option('--month <month>', 'Specific month to generate (YYYY-MM)')
  .option('--format <format>', 'Output format (xlsx|pdf)', 'pdf')
  .action(async (options) => {
    let allCommits = CacheManager.loadCommits();
    let since: Date;
    let until: Date = new Date();

    if (options.years) {
      const count = parseInt(options.years);
      since = new Date();
      since.setFullYear(until.getFullYear() - count);
      since.setDate(1); // Start of month
    } else if (options.year) {
      const year = parseInt(options.year);
      since = new Date(year, 0, 1);
      until = new Date(year, 11, 31, 23, 59, 59);
    } else if (options.since || options.until) {
      since = options.since ? new Date(options.since) : new Date(0);
      until = options.until ? new Date(options.until) : new Date();
    } else if (options.month) {
      const parts = options.month.split('-');
      if (parts.length !== 2) throw new Error('Month must be in YYYY-MM format');
      since = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
      until = new Date(parseInt(parts[0]), parseInt(parts[1]), 0, 23, 59, 59);
    } else {
      // Default: Current month
      since = new Date(until.getFullYear(), until.getMonth(), 1);
    }

    const commits = allCommits.filter(c => c.timestamp >= since && c.timestamp <= until);

    if (commits.length === 0) {
      console.log(`No commits found for the selected range (${since.toLocaleDateString()} - ${until.toLocaleDateString()}).`);
      return;
    }

    // Identify months in the range
    const sorted = [...commits].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const first = sorted[0].timestamp;
    const last = sorted[sorted.length - 1].timestamp;
    
    const monthsToVerify: string[] = [];
    let iter = new Date(first.getFullYear(), first.getMonth(), 1);
    while (iter <= last) {
      const mStr = `${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, '0')}`;
      monthsToVerify.push(mStr); // YYYY-MM
      iter.setMonth(iter.getMonth() + 1);
    }

    const targetWorkdays: Record<string, number> = {};
    const workdaysPath = path.join(process.cwd(), 'workdays.txt');
    
    if (!fs.existsSync(workdaysPath)) {
      console.error(`\n❌ Error: 'workdays.txt' not found in the current directory.`);
      console.log(`To generate a timesheet, you must provide a 'workdays.txt' file specifying how many days you worked each month.`);
      console.log(`Format: YYYY-MM - DaysWorked (e.g., 2022-02 - 21)`);
      console.log(`A sample file 'workdays.sample.txt' has been created for reference.`);
      process.exit(1);
    }

    const workdaysContent = fs.readFileSync(workdaysPath, 'utf-8');
    workdaysContent.split('\n').forEach(line => {
      const match = line.match(/^(\d{4}-\d{2})\s*-\s*(\d+)/);
      if (match) targetWorkdays[match[1]] = parseInt(match[2]);
    });

    // Validate all months in range are present
    const existingMonths = monthsToVerify.filter(m => {
      if (!targetWorkdays[m]) {
        console.warn(`\n⚠️  Warning: Month '${m}' is missing from 'workdays.txt'. Skipping...`);
        return false;
      }
      return true;
    });

    if (existingMonths.length === 0 && monthsToVerify.length > 0) {
      console.log('No months from the selected range are present in workdays.txt. Nothing to generate.');
      return;
    }

    // Update monthsToVerify with only existing ones
    monthsToVerify.splice(0, monthsToVerify.length, ...existingMonths);


    const timesheetDir = path.join(process.cwd(), 'timesheets');
    if (!fs.existsSync(timesheetDir)) fs.mkdirSync(timesheetDir, { recursive: true });

    const format = options.format || 'pdf';
    console.log(`\n📂 Generating monthly timesheets in: ${timesheetDir}`);

    for (const m of monthsToVerify) {
      const monthParts = m.split('-');
      const monthDate = new Date(parseInt(monthParts[0]), parseInt(monthParts[1]) - 1, 1);
      
      const generator = new ReportGenerator(allCommits);
      generator.setTargetWorkdays(targetWorkdays);
      
      // @ts-ignore - access private for verification
      const { activeCount } = generator.calculateMonthEntries(monthDate);
      
      if (activeCount === 0) {
        console.log(`  ⚠️  Skipping ${m}: No activity found.`);
        continue;
      }
      
      const outPath = path.join(timesheetDir, `${m}_timesheet.${format}`);
      if (format === 'xlsx') {
        await generator.generateTimesheetXlsx(outPath, monthDate);
      } else {
        await generator.generateTimesheetPdf(outPath, monthDate);
      }
      console.log(`  ✅ ${m}_timesheet.${format} (${activeCount} days)`);
    }
  });

program.parse(process.argv);
