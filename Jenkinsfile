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
		BRANCH_LOWER               = "${BRANCH_NAME.toLowerCase().replaceAll('\\\\', '-').replaceAll('/', '-').replaceAll('\\.', '-')}"
		COMPOSE_PROJECT_NAME       = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}"
		COMPOSE_FILE               = 'docker/docker-compose.ci.yml'
		COMPOSE_INTERACTIVE_NO_CLI = 1
		BUILDX_NAME                = "${COMPOSE_PROJECT_NAME}"
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
		stage('Builds') {
			parallel {
				stage('Project') {
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
				stage('Docs') {
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
				stage('Cypress') {
					steps {
						// Creating will also create the network prior to
						// using it in parallel stages below and mitigating
						// a race condition.
						sh 'docker-compose build cypress-sqlite'
						sh 'docker-compose build cypress-mysql'
						sh 'docker-compose create cypress-sqlite'
						sh 'docker-compose create cypress-mysql'
					}
				}
			}
		}
		stage('Integration Tests') {
			parallel {
				stage('Sqlite') {
					steps {
						// Bring up a stack
						sh 'docker-compose up -d fullstack-sqlite'
						sh './scripts/wait-healthy $(docker-compose ps --all -q fullstack-sqlite) 120'
						// Stop and Start it, as this will test it's ability to restart with existing data
						sh 'docker-compose stop fullstack-sqlite'
						sh 'docker-compose start fullstack-sqlite'
						sh './scripts/wait-healthy $(docker-compose ps --all -q fullstack-sqlite) 120'

						// Run tests
						sh 'rm -rf test/results-sqlite'
						sh 'docker-compose up cypress-sqlite'
						// Get results
						sh 'docker cp -L "$(docker-compose ps --all -q cypress-sqlite):/test/results" test/results-sqlite'
					}
					post {
						always {
							// Dumps to analyze later
							sh 'mkdir -p debug/sqlite'
							sh 'docker-compose logs fullstack-sqlite > debug/sqlite/docker_fullstack_sqlite.log'
							// Cypress videos and screenshot artifacts
							dir(path: 'test/results-sqlite') {
								archiveArtifacts allowEmptyArchive: true, artifacts: '**/*', excludes: '**/*.xml'
							}
							junit 'test/results-sqlite/junit/*'
						}
					}
				}
				stage('Mysql') {
					steps {
						// Bring up a stack
						sh 'docker-compose up -d fullstack-mysql'
						sh './scripts/wait-healthy $(docker-compose ps --all -q fullstack-mysql) 120'

						// Run tests
						sh 'rm -rf test/results-mysql'
						sh 'docker-compose up cypress-mysql'
						// Get results
						sh 'docker cp -L "$(docker-compose ps --all -q cypress-mysql):/test/results" test/results-mysql'
					}
					post {
						always {
							// Dumps to analyze later
							sh 'mkdir -p debug/mysql'
							sh 'docker-compose logs fullstack-mysql > debug/mysql/docker_fullstack_mysql.log'
							sh 'docker-compose logs db > debug/mysql/docker_db.log'
							// Cypress videos and screenshot artifacts
							dir(path: 'test/results-mysql') {
								archiveArtifacts allowEmptyArchive: true, artifacts: '**/*', excludes: '**/*.xml'
							}
							junit 'test/results-mysql/junit/*'
						}
					}
				}
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
		stage('Docs / Comment') {
			parallel {
				stage('Master Docs') {
					when {
						allOf {
							branch 'master'
							not {
								equals expected: 'UNSTABLE', actual: currentBuild.result
							}
						}
					}
					steps {
						npmDocsReleaseMaster()
					}
				}
				stage('Develop Docs') {
					when {
						allOf {
							branch 'develop'
							not {
								equals expected: 'UNSTABLE', actual: currentBuild.result
							}
						}
					}
					steps {
						npmDocsReleaseDevelop()
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
			archiveArtifacts(artifacts: 'debug/**/*.*', allowEmptyArchive: true)
			juxtapose event: 'failure'
			sh 'figlet "FAILURE"'
		}
		unstable {
			archiveArtifacts(artifacts: 'debug/**/*.*', allowEmptyArchive: true)
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
