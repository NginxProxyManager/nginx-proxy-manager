import groovy.transform.Field

@Field
def shOutput = ""
def buildxPushTags = ""

pipeline {
	agent {
		label 'docker-multiarch'
	}
	options {
		buildDiscarder(logRotator(numToKeepStr: '5'))
		disableConcurrentBuilds()
		ansiColor('xterm')
	}
	environment {
		IMAGE                      = 'nginx-proxy-manager'
		BUILD_VERSION              = getVersion()
		MAJOR_VERSION              = '2'
		BRANCH_LOWER               = "${BRANCH_NAME.toLowerCase().replaceAll('/', '-')}"
		COMPOSE_PROJECT_NAME       = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}"
		COMPOSE_FILE               = 'docker/docker-compose.ci.yml'
		COMPOSE_INTERACTIVE_NO_CLI = 1
		BUILDX_NAME                = "${COMPOSE_PROJECT_NAME}"
		DOCS_BUCKET                = 'jc21-npm-site'
		DOCS_CDN                   = 'EN1G6DEWZUTDT'
	}
	stages {
		stage('Environment') {
			parallel {
				stage('Master') {
					when {
						branch 'master'
					}
					steps {
						script {
							buildxPushTags = "-t docker.io/jc21/${IMAGE}:${BUILD_VERSION} -t docker.io/jc21/${IMAGE}:${MAJOR_VERSION} -t docker.io/jc21/${IMAGE}:latest"
						}
					}
				}
				stage('Other') {
					when {
						not {
							branch 'master'
						}
					}
					steps {
						script {
							// Defaults to the Branch name, which is applies to all branches AND pr's
							buildxPushTags = "-t docker.io/jc21/${IMAGE}:github-${BRANCH_LOWER}"
						}
					}
				}
				stage('Versions') {
					steps {
						sh 'cat frontend/package.json | jq --arg BUILD_VERSION "${BUILD_VERSION}" \'.version = $BUILD_VERSION\' | sponge frontend/package.json'
						sh 'echo -e "\\E[1;36mFrontend Version is:\\E[1;33m $(cat frontend/package.json | jq -r .version)\\E[0m"'
						sh 'cat backend/package.json | jq --arg BUILD_VERSION "${BUILD_VERSION}" \'.version = $BUILD_VERSION\' | sponge backend/package.json'
						sh 'echo -e "\\E[1;36mBackend Version is:\\E[1;33m  $(cat backend/package.json | jq -r .version)\\E[0m"'
						sh 'sed -i -E "s/(version-)[0-9]+\\.[0-9]+\\.[0-9]+(-green)/\\1${BUILD_VERSION}\\2/" README.md'
					}
				}
			}
		}
		stage('Build and Test') {
			steps {
				script {
					// Frontend and Backend
					def shStatusCode = sh(label: 'Checking and Building', returnStatus: true, script: '''
						set -e
						./scripts/ci/frontend-build > ${WORKSPACE}/tmp-sh-build 2>&1
						./scripts/ci/test-and-build > ${WORKSPACE}/tmp-sh-build 2>&1
					''')
					shOutput = readFile "${env.WORKSPACE}/tmp-sh-build"
					if (shStatusCode != 0) {
						error "${shOutput}"
					}
				}
			}
			post {
				always {
					sh 'rm -f ${WORKSPACE}/tmp-sh-build'
				}
				failure {
					npmGithubPrComment("CI Error:\n\n```\n${shOutput}\n```", true)
				}
			}
		}
		stage('Integration Tests Sqlite') {
			steps {
				// Bring up a stack
				sh 'docker-compose up -d fullstack-sqlite'
				sh './scripts/wait-healthy $(docker-compose ps -q fullstack-sqlite) 120'

				// Run tests
				sh 'rm -rf test/results'
				sh 'docker-compose up cypress-sqlite'
				// Get results
				sh 'docker cp -L "$(docker-compose ps -q cypress-sqlite):/test/results" test/'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug'
					sh 'docker-compose logs fullstack-sqlite > debug/docker_fullstack_sqlite.log'
					sh 'docker-compose logs db > debug/docker_db.log'
					// Cypress videos and screenshot artifacts
					dir(path: 'test/results') {
						archiveArtifacts allowEmptyArchive: true, artifacts: '**/*', excludes: '**/*.xml'
					}
					junit 'test/results/junit/*'
				}
			}
		}
		stage('Integration Tests Mysql') {
			steps {
				// Bring up a stack
				sh 'docker-compose up -d fullstack-mysql'
				sh './scripts/wait-healthy $(docker-compose ps -q fullstack-mysql) 120'

				// Run tests
				sh 'rm -rf test/results'
				sh 'docker-compose up cypress-mysql'
				// Get results
				sh 'docker cp -L "$(docker-compose ps -q cypress-mysql):/test/results" test/'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug'
					sh 'docker-compose logs fullstack-mysql > debug/docker_fullstack_mysql.log'
					sh 'docker-compose logs db > debug/docker_db.log'
					// Cypress videos and screenshot artifacts
					dir(path: 'test/results') {
						archiveArtifacts allowEmptyArchive: true, artifacts: '**/*', excludes: '**/*.xml'
					}
					junit 'test/results/junit/*'
				}
			}
		}
		stage('Docs') {
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				dir(path: 'docs') {
					sh 'yarn install'
					sh 'yarn build'
				}

				dir(path: 'docs/.vuepress/dist') {
					sh 'tar -czf ../../docs.tgz *'
				}

				archiveArtifacts(artifacts: 'docs/docs.tgz', allowEmptyArchive: false)
			}
		}
		stage('MultiArch Build') {
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
					sh 'docker login -u "${duser}" -p "${dpass}"'
					sh "./scripts/buildx --push ${buildxPushTags}"
				}
			}
		}
		stage('Docs Deploy') {
			when {
				allOf {
					branch 'master'
					not {
						equals expected: 'UNSTABLE', actual: currentBuild.result
					}
				}
			}
			steps {
				npmDocsRelease("$DOCS_BUCKET", "$DOCS_CDN")
			}
		}
		stage('PR Comment') {
			when {
				allOf {
					changeRequest()
					not {
						equals expected: 'UNSTABLE', actual: currentBuild.result
					}
				}
			}
			steps {
				script {
					npmGithubPrComment("Docker Image for build ${BUILD_NUMBER} is available on [DockerHub](https://cloud.docker.com/repository/docker/jc21/${IMAGE}) as `jc21/${IMAGE}:github-${BRANCH_LOWER}`\n\n**Note:** ensure you backup your NPM instance before testing this PR image! Especially if this PR contains database changes.", true)
				}
			}
		}
	}
	post {
		always {
			sh 'docker-compose down --remove-orphans --volumes -t 30'
			sh 'echo Reverting ownership'
			sh 'docker run --rm -v $(pwd):/data jc21/ci-tools chown -R $(id -u):$(id -g) /data'
		}
		success {
			juxtapose event: 'success'
			sh 'figlet "SUCCESS"'
		}
		failure {
			archiveArtifacts(artifacts: 'debug/**.*', allowEmptyArchive: true)
			juxtapose event: 'failure'
			sh 'figlet "FAILURE"'
		}
		unstable {
			archiveArtifacts(artifacts: 'debug/**.*', allowEmptyArchive: true)
			juxtapose event: 'unstable'
			sh 'figlet "UNSTABLE"'
		}
	}
}

def getVersion() {
	ver = sh(script: 'cat .version', returnStdout: true)
	return ver.trim()
}

def getCommit() {
	ver = sh(script: 'git log -n 1 --format=%h', returnStdout: true)
	return ver.trim()
}
